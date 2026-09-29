"""
wrapper.py — Drop-in OpenAI Client Wrapper for MemoLM.

Enables seamless, 1-line integration with existing openai.OpenAI and
openai.AsyncOpenAI clients without changing existing call sites.
"""

from typing import Any, Optional, Dict, Callable
import logging

from memolm.client import MemoLM
from memolm.async_client import AsyncMemoLM
from memolm.models import MemoLMStats
from memolm.exceptions import GatewayUnavailableError

logger = logging.getLogger("memolm")


class _WrappedCompletions:
    def __init__(self, original_completions: Any, memolm_completions: Any, fallback_to_upstream: bool = True) -> None:
        self._original = original_completions
        self._memolm = memolm_completions
        self._fallback_to_upstream = fallback_to_upstream

    def create(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return self._memolm.create(*args, **kwargs)
        except GatewayUnavailableError as exc:
            if self._fallback_to_upstream:
                logger.warning(
                    "[MemoLM] Gateway unavailable (%s); failing open to original OpenAI client",
                    exc,
                )
                # Strip MemoLM-specific kwargs before calling upstream OpenAI
                clean_kwargs = {
                    k: v
                    for k, v in kwargs.items()
                    if k not in (
                        "knowledge_version",
                        "tenant_id",
                        "risk",
                        "ttl_seconds",
                        "force_refresh",
                        "cache_only",
                        "similarity_threshold",
                    )
                }
                return self._original.create(*args, **clean_kwargs)
            raise

    def __getattr__(self, name: str) -> Any:
        return getattr(self._original, name)


class _WrappedAsyncCompletions:
    def __init__(self, original_completions: Any, memolm_completions: Any, fallback_to_upstream: bool = True) -> None:
        self._original = original_completions
        self._memolm = memolm_completions
        self._fallback_to_upstream = fallback_to_upstream

    async def create(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return await self._memolm.create(*args, **kwargs)
        except GatewayUnavailableError as exc:
            if self._fallback_to_upstream:
                logger.warning(
                    "[MemoLM] Gateway unavailable (%s); failing open to original AsyncOpenAI client",
                    exc,
                )
                clean_kwargs = {
                    k: v
                    for k, v in kwargs.items()
                    if k not in (
                        "knowledge_version",
                        "tenant_id",
                        "risk",
                        "ttl_seconds",
                        "force_refresh",
                        "cache_only",
                        "similarity_threshold",
                    )
                }
                return await self._original.create(*args, **clean_kwargs)
            raise

    def __getattr__(self, name: str) -> Any:
        return getattr(self._original, name)


class _WrappedChat:
    def __init__(self, original_chat: Any, memolm_chat: Any, is_async: bool = False, fallback_to_upstream: bool = True) -> None:
        self._original = original_chat
        if is_async:
            self.completions = _WrappedAsyncCompletions(
                original_chat.completions, memolm_chat.completions, fallback_to_upstream=fallback_to_upstream
            )
        else:
            self.completions = _WrappedCompletions(
                original_chat.completions, memolm_chat.completions, fallback_to_upstream=fallback_to_upstream
            )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._original, name)


class _WrappedOpenAIClient:
    def __init__(self, original_client: Any, memolm_client: Any, is_async: bool = False, fallback_to_upstream: bool = True) -> None:
        self._original = original_client
        self._memolm = memolm_client
        self.chat = _WrappedChat(
            original_client.chat, memolm_client.chat, is_async=is_async, fallback_to_upstream=fallback_to_upstream
        )

    @property
    def memolm(self) -> Any:
        """Access underlying MemoLM client for metrics and configuration."""
        return self._memolm

    @property
    def cache(self) -> Any:
        """Access active cache management APIs."""
        return self._memolm.cache

    def get_session_metrics(self) -> Any:
        """Convenience accessor for MemoLM session metrics."""
        return self._memolm.get_session_metrics()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._original, name)


def wrap_openai(
    openai_client: Any,
    base_url: Optional[str] = None,
    gateway_url: Optional[str] = None,
    knowledge_version: str = "v1",
    tenant_id: str = "default-tenant",
    risk: str = "low",
    ttl_seconds: Optional[int] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    fallback_to_upstream: bool = True,
    max_retries: int = 2,
    timeout: float = 60.0,
    on_cache_hit: Optional[Callable[[MemoLMStats], Any]] = None,
    on_cache_miss: Optional[Callable[[MemoLMStats], Any]] = None,
    on_safety_reject: Optional[Callable[[Any], Any]] = None,
) -> Any:
    """
    Wrap an existing `openai.OpenAI` or `openai.AsyncOpenAI` client instance.
    Intercepts `client.chat.completions.create` to route requests through MemoLM
    with safety caching and optional fail-open fallback.
    """
    effective_url = base_url or gateway_url or "http://localhost:8000"

    # Detect whether client is async
    is_async = getattr(openai_client, "_is_async", False) is True or (
        type(openai_client).__name__.startswith("Async")
    )

    api_key = getattr(openai_client, "api_key", "memo-key") or "memo-key"

    if is_async:
        memolm_client = AsyncMemoLM(
            base_url=effective_url,
            api_key=api_key,
            default_tenant=tenant_id,
            default_knowledge_version=knowledge_version,
            default_risk=risk,
            default_headers=extra_headers,
            max_retries=max_retries,
            timeout=timeout,
            on_cache_hit=on_cache_hit,
            on_cache_miss=on_cache_miss,
            on_safety_reject=on_safety_reject,
        )
    else:
        memolm_client = MemoLM(
            base_url=effective_url,
            api_key=api_key,
            default_tenant=tenant_id,
            default_knowledge_version=knowledge_version,
            default_risk=risk,
            default_headers=extra_headers,
            max_retries=max_retries,
            timeout=timeout,
            on_cache_hit=on_cache_hit,
            on_cache_miss=on_cache_miss,
            on_safety_reject=on_safety_reject,
        )

    return _WrappedOpenAIClient(
        original_client=openai_client,
        memolm_client=memolm_client,
        is_async=is_async,
        fallback_to_upstream=fallback_to_upstream,
    )
