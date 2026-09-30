"""Groq Provider — using the official groq SDK."""
import time
import uuid
from typing import Any, AsyncGenerator, ClassVar, Dict, List, Optional
from provider.base import BaseLLMProvider, ProviderError, ProviderNotConfigured, to_openai_chunk

class GroqProvider(BaseLLMProvider):
    name: ClassVar[str] = "groq"
    env_prefix: ClassVar[str] = "GROQ"
    default_model: ClassVar[str] = "openai/gpt-oss-20b"

    def _build_chat_model(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> Any:
        from groq import AsyncGroq
        # If client passes a MemoLM gateway key (e.g. memo-key), ignore and use server's GROQ_API_KEY
        if api_key and (api_key.startswith("gsk_") or len(api_key) > 30):
            effective_key = api_key
        else:
            effective_key = self.config.api_key

        if not effective_key:
            raise ProviderNotConfigured("Groq API key not configured. Set GROQ_API_KEY in backend/.env.")
        kwargs: Dict[str, Any] = {"api_key": effective_key}
        effective_base_url = base_url or self.config.base_url
        if effective_base_url:
            kwargs["base_url"] = effective_base_url
        return AsyncGroq(**kwargs)

    async def complete(
        self,
        model: str,
        messages: list,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        client = self._get_chat_model(model, api_key=api_key, base_url=base_url)
        clean_messages = []
        for m in messages:
            if isinstance(m, dict) and m.get("content"):
                clean_messages.append({"role": m.get("role", "user"), "content": m.get("content")})

        target_model = model or self.default_model
        kwargs: Dict[str, Any] = {
            "model": target_model,
            "messages": clean_messages,
        }
        if temperature is not None:
            kwargs["temperature"] = temperature
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens

        try:
            res = await client.chat.completions.create(**kwargs)
            return {
                "id": res.id or f"chatcmpl-{uuid.uuid4().hex[:24]}",
                "object": "chat.completion",
                "created": int(res.created or time.time()),
                "model": res.model or target_model,
                "provider": "groq",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": res.choices[0].message.role or "assistant",
                            "content": res.choices[0].message.content or "",
                        },
                        "finish_reason": res.choices[0].finish_reason or "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": res.usage.prompt_tokens if res.usage else 0,
                    "completion_tokens": res.usage.completion_tokens if res.usage else 0,
                    "total_tokens": res.usage.total_tokens if res.usage else 0,
                },
            }
        except Exception as exc:
            raise ProviderError(f"Groq API completion error: {exc}") from exc

    async def stream(
        self,
        model: str,
        messages: list,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        client = self._get_chat_model(model, api_key=api_key, base_url=base_url)
        clean_messages = []
        for m in messages:
            if isinstance(m, dict) and m.get("content"):
                clean_messages.append({"role": m.get("role", "user"), "content": m.get("content")})

        target_model = model or self.default_model
        kwargs: Dict[str, Any] = {
            "model": target_model,
            "messages": clean_messages,
            "stream": True,
        }
        if temperature is not None:
            kwargs["temperature"] = temperature
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens

        completion_id = f"chatcmpl-memolm-{uuid.uuid4().hex[:24]}"
        created = int(time.time())

        try:
            stream_resp = await client.chat.completions.create(**kwargs)
            async for chunk in stream_resp:
                if chunk.choices and chunk.choices[0].delta:
                    delta_content = chunk.choices[0].delta.content or ""
                    if delta_content:
                        yield to_openai_chunk(
                            delta_content,
                            completion_id=completion_id,
                            created=created,
                            model=target_model,
                        )
        except Exception as exc:
            raise ProviderError(f"Groq API streaming error: {exc}") from exc
