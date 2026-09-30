"""
Shared plumbing for every upstream LLM provider.
"""
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, ClassVar, Dict, Iterable, List, Optional

DEFAULT_MAX_TOKENS = 4096

class ProviderError(Exception):
    """Any failure while constructing or calling an upstream provider."""

class ProviderNotFound(ProviderError):
    """The requested provider name is not in the registry."""

class ProviderNotConfigured(ProviderError):
    """The provider exists but has no API key."""

class ProviderConfig:
    def __init__(self, name: str, env_prefix: str, default_model: str = "") -> None:
        import os
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass
        self.name = name
        self.api_key = (os.getenv(f"{env_prefix}_API_KEY") or "").strip()
        self.base_url = (os.getenv(f"{env_prefix}_BASE_URL") or "").strip() or None
        self.model = (os.getenv(f"{env_prefix}_MODEL") or "").strip() or default_model

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def __repr__(self) -> str:
        state = "configured" if self.is_configured else "missing API key"
        return f"<ProviderConfig {self.name} ({state})>"

class BaseLLMProvider(ABC):
    name: ClassVar[str] = ""
    env_prefix: ClassVar[str] = ""
    default_model: ClassVar[str] = ""

    def __init__(self) -> None:
        self.config = ProviderConfig(self.name, self.env_prefix, self.default_model)
        self._models: Dict[str, Any] = {}

    @abstractmethod
    def _build_chat_model(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> Any:
        """Instantiate this provider's LangChain chat model."""

    def _get_chat_model(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> Any:
        candidate_key = (api_key or "").strip()
        if candidate_key and not candidate_key.startswith("memo-") and candidate_key != "memo-key":
            effective_key = candidate_key
        else:
            effective_key = self.config.api_key

        effective_base_url = (base_url or "").strip() or self.config.base_url
        if not effective_key:
            raise ProviderNotConfigured(
                f"Provider '{self.name}' has no API key. "
                f"Provide an 'Authorization: Bearer <key>' or 'x-memolm-api-key' header, "
                f"or set {self.env_prefix}_API_KEY on the server."
            )
        cache_key = f"{model}::{effective_key[-6:]}::{effective_base_url or ''}"
        if cache_key not in self._models:
            self._models[cache_key] = self._build_chat_model(model, api_key=effective_key, base_url=effective_base_url)
        return self._models[cache_key]

    def _options(self, temperature: Optional[float], max_tokens: Optional[int]) -> Dict[str, Any]:
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
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        chat_model = self._get_chat_model(model, api_key=api_key, base_url=base_url)
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
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        chat_model = self._get_chat_model(model, api_key=api_key, base_url=base_url)
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

def to_lc_messages(messages: Iterable[Any]) -> list:
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
            total = int(usage_metadata.get("total_tokens", 0) or 0) or (prompt + completion)
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
    }
