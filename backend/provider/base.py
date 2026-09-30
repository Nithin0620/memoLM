"""
Shared plumbing for every upstream LLM provider.

Each provider file subclasses BaseLLMProvider and implements exactly one method,
_build_chat_model(). Everything else — credential loading, message conversion,
OpenAI response normalization, streaming, and max_tokens defaulting — lives here
so the four provider files stay small and cannot drift apart.

The gateway must keep emitting the OpenAI Chat Completion wire shape because both
SDKs (sdk/typescript/src/client.ts and sdk/python/memolm/client.py) parse that
shape directly. LangChain returns its own types, so to_openai_completion() and
to_openai_chunk() are the translation boundary.
"""

import time
import uuid
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, ClassVar, Dict, Iterable, List, Optional

# Anthropic requires max_tokens and LangChain silently defaults it to 1024, which
# truncates long answers with no error. Every provider gets this same average
# budget instead, so switching providers never changes the output length.
DEFAULT_MAX_TOKENS = 4096


class ProviderError(Exception):
    """Any failure while constructing or calling an upstream provider."""


class ProviderNotFound(ProviderError):
    """The requested provider name is not in the registry."""


class ProviderNotConfigured(ProviderError):
    """The provider exists but has no API key in the environment."""


class ProviderConfig:
    """One provider's server-side credentials, read from the environment.

    A request may name a provider and a model. It may never name a key or a base
    URL — both are resolved here, server-side, so the developer's key never
    reaches the browser or leaves the process.
    """

    def __init__(self, name: str, env_prefix: str, default_model: str = "") -> None:
        import os

        # Idempotent and non-overriding, so calling it here is safe even though
        # main.py already loads .env. It guarantees the registry reads the right
        # values regardless of import order.
        try:
            from dotenv import load_dotenv

            load_dotenv()
        except ImportError:  # pragma: no cover - dotenv is a declared dependency
            pass

        self.name = name
        self.api_key = (os.getenv(f"{env_prefix}_API_KEY") or "").strip()
        self.base_url = (os.getenv(f"{env_prefix}_BASE_URL") or "").strip() or None
        self.model = (os.getenv(f"{env_prefix}_MODEL") or "").strip() or default_model

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def __repr__(self) -> str:  # pragma: no cover - debug aid, never leaks the key
        state = "configured" if self.is_configured else "missing API key"
        return f"<ProviderConfig {self.name} ({state})>"


class BaseLLMProvider(ABC):
    """Uniform async chat interface over a LangChain chat model."""

    name: ClassVar[str] = ""
    env_prefix: ClassVar[str] = ""
    default_model: ClassVar[str] = ""

    def __init__(self) -> None:
        self.config = ProviderConfig(self.name, self.env_prefix, self.default_model)
        if not self.config.is_configured:
            raise ProviderNotConfigured(
                f"Provider '{self.name}' is not configured. "
                f"Set {self.env_prefix}_API_KEY in backend/.env."
            )
        # One chat model per (provider, model). They are stateless and hold an
        # HTTP connection pool, so building one per request would be wasteful.
        self._models: Dict[str, Any] = {}

    @abstractmethod
    def _build_chat_model(self, model: str) -> Any:
        """Instantiate this provider's LangChain chat model for `model`."""

    def _get_chat_model(self, model: str) -> Any:
        if model not in self._models:
            self._models[model] = self._build_chat_model(model)
        return self._models[model]

    def _options(self, temperature: Optional[float], max_tokens: Optional[int]) -> Dict[str, Any]:
        """Runtime bind options for one call.

        Set at invoke time rather than construction time so the per-model chat
        model cache stays keyed on the model name alone. Providers whose token
        limit is not called max_tokens override this.
        """
        options: Dict[str, Any] = {"max_tokens": max_tokens or DEFAULT_MAX_TOKENS}
        if temperature is not None:
            options["temperature"] = temperature
        return options

    async def complete(
        self,
        model: str,
        messages: list,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Return a normalized OpenAI Chat Completion dict."""
        chat_model = self._get_chat_model(model)
        lc_messages = to_lc_messages(messages)
        if not lc_messages:
            raise ProviderError(f"Provider '{self.name}' received no usable messages.")

        response = await chat_model.ainvoke(lc_messages, **self._options(temperature, max_tokens))
        return to_openai_completion(response, model=model, provider=self.name)

    async def stream(
        self,
        model: str,
        messages: list,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Yield normalized OpenAI chat.completion.chunk dicts."""
        chat_model = self._get_chat_model(model)
        lc_messages = to_lc_messages(messages)
        if not lc_messages:
            raise ProviderError(f"Provider '{self.name}' received no usable messages.")

        completion_id = f"chatcmpl-memolm-{uuid.uuid4().hex[:24]}"
        created = int(time.time())
        options = self._options(temperature, max_tokens)

        async for chunk in chat_model.astream(lc_messages, **options):
            text = chunk_text(chunk)
            if not text:
                continue
            yield to_openai_chunk(
                text, completion_id=completion_id, created=created, model=model
            )


# ---------------------------------------------------------------------------
# Message conversion
# ---------------------------------------------------------------------------
def to_lc_messages(messages: Iterable[Any]) -> list:
    """OpenAI [{role, content}] -> LangChain BaseMessage list.

    Non-string and empty content is dropped rather than passed through: LangChain
    raises on a message with no text, which would turn a healthy request into a
    500. Mirrors the tolerance in database/qdrant_store.user_chain.
    """
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    converted = []
    for message in messages or []:
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        role = message.get("role", "user")
        if role == "system":
            converted.append(SystemMessage(content=content))
        elif role == "assistant":
            converted.append(AIMessage(content=content))
        else:
            converted.append(HumanMessage(content=content))
    return converted


def chunk_text(chunk: Any) -> str:
    """Extract plain text from a LangChain message chunk.

    AIMessageChunk.content is typed `str | list[dict]`. All four providers return
    str for text, but the list branch is a content-block list on some model
    versions. A bare list put into a JSON response would emit a shape the SDKs
    cannot parse, so the blocks are flattened explicitly.
    """
    content = getattr(chunk, "content", chunk)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text") or block.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def _completion_options(
    temperature: Optional[float], max_tokens: Optional[int]
) -> Dict[str, Any]:
    """Module-level default, kept for callers outside the class hierarchy."""
    options: Dict[str, Any] = {"max_tokens": max_tokens or DEFAULT_MAX_TOKENS}
    if temperature is not None:
        options["temperature"] = temperature
    return options


# ---------------------------------------------------------------------------
# OpenAI wire-shape normalization
# ---------------------------------------------------------------------------
def to_openai_completion(response: Any, model: str, provider: str) -> Dict[str, Any]:
    return {
        "id": _response_id(response),
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "provider": provider,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": chunk_text(response)},
                "finish_reason": "stop",
            }
        ],
        "usage": _usage(response),
    }


def to_openai_chunk(
    text: str,
    completion_id: str,
    created: int,
    model: str,
    finish_reason: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": text},
                "finish_reason": finish_reason,
            }
        ],
    }


def _response_id(response: Any) -> str:
    metadata = getattr(response, "response_metadata", None) or {}
    for key in ("id", "response_id", "message_id"):
        value = metadata.get(key)
        if isinstance(value, str) and value:
            return value
    return f"chatcmpl-memolm-{uuid.uuid4().hex[:24]}"


def _usage(response: Any) -> Dict[str, int]:
    """Best-effort token accounting. LangChain exposes this under two names
    depending on integration and version, and neither is guaranteed present."""
    prompt = completion = total = 0

    metadata = getattr(response, "response_metadata", None) or {}
    raw = metadata.get("token_usage") or metadata.get("usage")
    if isinstance(raw, dict):
        prompt = int(raw.get("prompt_tokens", raw.get("input_tokens", 0)) or 0)
        completion = int(raw.get("completion_tokens", raw.get("output_tokens", 0)) or 0)
        total = int(raw.get("total_tokens", 0) or 0) or (prompt + completion)

    if not total:
        usage_metadata = getattr(response, "usage_metadata", None) or {}
        if isinstance(usage_metadata, dict):
            prompt = prompt or int(usage_metadata.get("input_tokens", 0) or 0)
            completion = completion or int(usage_metadata.get("output_tokens", 0) or 0)
            total = int(usage_metadata.get("total_tokens", 0) or 0) or (
                prompt + completion
            )

    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
    }
