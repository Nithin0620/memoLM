from typing import List, Dict, Optional, Any, Union, Iterator, Callable, overload, Literal
import httpx
import json
import logging
import os

from memolm.models import ChatCompletion, ChatCompletionChunk, Message, MemoLMStats, SessionMetrics
from memolm.exceptions import (
    MemoLMError,
    UpstreamProviderError,
    GatewayUnavailableError,
    SafetyGateRejectionError,
    CacheMissError,
)
from memolm.cache import CacheClient
from memolm.streaming import create_sse_stream
from memolm._retry import should_retry, sleep_before_retry, DEFAULT_MAX_RETRIES

logger = logging.getLogger("memolm")


class Completions:
    def __init__(self, client: "MemoLM") -> None:
        self._client = client

    @overload
    def create(
        self,
        *,
        messages: List[Union[Dict[str, Any], Message]],
        model: Optional[str] = None,
        knowledge_version: Optional[str] = None,
        tenant_id: Optional[str] = None,
        risk: Optional[str] = None,
        ttl_seconds: Optional[int] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: Literal[False] = False,
        force_refresh: bool = False,
        cache_only: bool = False,
        similarity_threshold: Optional[float] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        **extra_kwargs: Any,
    ) -> ChatCompletion: ...

    @overload
    def create(
        self,
        *,
        messages: List[Union[Dict[str, Any], Message]],
        model: Optional[str] = None,
        knowledge_version: Optional[str] = None,
        tenant_id: Optional[str] = None,
        risk: Optional[str] = None,
        ttl_seconds: Optional[int] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: Literal[True],
        force_refresh: bool = False,
        cache_only: bool = False,
        similarity_threshold: Optional[float] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        **extra_kwargs: Any,
    ) -> Iterator[ChatCompletionChunk]: ...

    def create(
        self,
        *,
        messages: List[Union[Dict[str, Any], Message]],
        model: Optional[str] = None,
        knowledge_version: Optional[str] = None,
        tenant_id: Optional[str] = None,
        risk: Optional[str] = None,
        ttl_seconds: Optional[int] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        force_refresh: bool = False,
        cache_only: bool = False,
        similarity_threshold: Optional[float] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        **extra_kwargs: Any,
    ) -> Union[ChatCompletion, Iterator[ChatCompletionChunk]]:
        """
        Creates a model response for the given chat conversation.
        Intercepts requests through the MemoLM Safety Gate and Semantic Cache.
        """
        return self._client._post_chat_completion(
            messages=messages,
            model=model,
            knowledge_version=knowledge_version,
            tenant_id=tenant_id,
            risk=risk,
            ttl_seconds=ttl_seconds,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
            force_refresh=force_refresh,
            cache_only=cache_only,
            similarity_threshold=similarity_threshold,
            extra_headers=extra_headers,
            extra_kwargs=extra_kwargs,
        )


class Chat:
    def __init__(self, client: "MemoLM") -> None:
        self.completions = Completions(client)


class MemoLM:
    """
    Synchronous MemoLM client for OpenAI-compatible chat completions with
    built-in semantic caching, Safety Gate verification, resilience, and telemetry.
    """

    def __init__(
        self,
        base_url: str = "https://memolm.onrender.com",
        api_key: str = "memo-key",
        default_tenant: str = "default-tenant",
        default_knowledge_version: str = "v1",
        default_risk: str = "low",
        default_model: Optional[str] = None,
        default_headers: Optional[Dict[str, str]] = None,
        timeout: float = 60.0,
        max_retries: int = DEFAULT_MAX_RETRIES,
        fallback_to_upstream: bool = False,
        upstream_provider: str = "groq",
        upstream_api_key: Optional[str] = None,
        upstream_base_url: Optional[str] = None,
        on_cache_hit: Optional[Callable[[MemoLMStats], Any]] = None,
        on_cache_miss: Optional[Callable[[MemoLMStats], Any]] = None,
        on_safety_reject: Optional[Callable[[List[str]], Any]] = None,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_tenant = default_tenant
        self.default_knowledge_version = default_knowledge_version
        self.default_risk = default_risk
        self.default_model = default_model
        self.default_headers = default_headers or {}
        self.timeout = timeout
        self.max_retries = max_retries

        self.fallback_to_upstream = fallback_to_upstream
        self.upstream_provider = upstream_provider
        self.upstream_api_key = upstream_api_key or os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
        self.upstream_base_url = upstream_base_url or (
            "https://api.openai.com/v1" if upstream_provider == "openai" else "https://api.groq.com/openai/v1"
        )

        self.on_cache_hit = on_cache_hit
        self.on_cache_miss = on_cache_miss
        self.on_safety_reject = on_safety_reject

        self._session_metrics: Dict[str, Any] = {
            "total_requests": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "safety_rejections": 0,
            "total_latency_saved_sec": 0.0,
            "estimated_cost_saved_usd": 0.0,
        }

        self._http_client = http_client or httpx.Client(timeout=timeout)
        self._owns_http_client = http_client is None

        self.chat = Chat(self)
        self.cache = CacheClient(self)

    def get_session_metrics(self) -> SessionMetrics:
        """Returns session-level cache ROI metrics."""
        total = self._session_metrics["total_requests"]
        hits = self._session_metrics["cache_hits"]
        hit_rate = round((hits / total * 100), 2) if total > 0 else 0.0
        return SessionMetrics({
            **self._session_metrics,
            "hit_rate_pct": hit_rate,
        })

    def _record_stats(self, stats: Optional[MemoLMStats]) -> None:
        self._session_metrics["total_requests"] += 1
        if stats is None:
            self._session_metrics["cache_misses"] += 1
            return

        verdict = (stats.verdict or stats.hit_type or "").upper()
        if "HIT" in verdict:
            self._session_metrics["cache_hits"] += 1
            saved = stats.latency_saved or 0.0
            if saved > 100.0:  # milliseconds to seconds
                saved /= 1000.0
            elif getattr(stats, "latency_saved_ms", 0.0) > 0 and saved == 0.0:
                saved = stats.latency_saved_ms / 1000.0
            self._session_metrics["total_latency_saved_sec"] += round(saved, 3)
            cost_saved = getattr(stats, "cost_saved", 0.0) or stats.estimated_cost_usd or 0.005
            self._session_metrics["estimated_cost_saved_usd"] += round(cost_saved, 5)
            if self.on_cache_hit:
                try:
                    self.on_cache_hit(stats)
                except Exception as e:
                    logger.debug("on_cache_hit callback error: %s", e)
        elif "SAFETY_REJECTED" in verdict or "REJECT" in verdict:
            self._record_safety_rejection(stats.rejection_reasons or [], from_stats=True)
            if self.on_cache_miss:
                try:
                    self.on_cache_miss(stats)
                except Exception as e:
                    logger.debug("on_cache_miss callback error: %s", e)
        else:
            self._session_metrics["cache_misses"] += 1
            if self.on_cache_miss:
                try:
                    self.on_cache_miss(stats)
                except Exception as e:
                    logger.debug("on_cache_miss callback error: %s", e)

    def _record_safety_rejection(self, reasons: List[str], from_stats: bool = False) -> None:
        if not from_stats:
            self._session_metrics["total_requests"] += 1
        self._session_metrics["safety_rejections"] += 1
        if self.on_safety_reject:
            class _SafetyDetails(list):
                def __init__(self, r: List[str]) -> None:
                    super().__init__(r)
                    self.rejection_reasons = r
                    self.verdict = "SAFETY_REJECTED"

            try:
                self.on_safety_reject(_SafetyDetails(reasons))
            except Exception as e:
                logger.debug("on_safety_reject callback error: %s", e)

    def _get_target_url(self) -> str:
        if self.base_url.endswith("/openai/v1") or self.base_url.endswith("/v1"):
            return f"{self.base_url}/chat/completions"
        return f"{self.base_url}/openai/v1/chat/completions"

    def _prepare_headers(
        self,
        knowledge_version: Optional[str] = None,
        tenant_id: Optional[str] = None,
        risk: Optional[str] = None,
        ttl_seconds: Optional[int] = None,
        force_refresh: bool = False,
        cache_only: bool = False,
        similarity_threshold: Optional[float] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        selected_version = knowledge_version or self.default_knowledge_version
        selected_tenant = tenant_id or self.default_tenant
        selected_risk = risk or self.default_risk

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "x-memolm-tenant": selected_tenant,
            "x-memolm-version": selected_version,
            "x-memolm-knowledge-version": selected_version,
            "x-memolm-risk": selected_risk,
            **self.default_headers,
        }

        if ttl_seconds is not None:
            headers["x-memolm-ttl"] = str(ttl_seconds)
        if force_refresh:
            headers["x-memolm-force-refresh"] = "true"
        if cache_only:
            headers["x-memolm-cache-only"] = "true"
        if similarity_threshold is not None:
            headers["x-memolm-similarity-threshold"] = str(similarity_threshold)

        if extra_headers:
            headers.update(extra_headers)

        return headers

    def _execute_fallback(
        self,
        target_endpoint: str,
        payload: Dict[str, Any],
        stream: bool,
    ) -> Union[ChatCompletion, Iterator[ChatCompletionChunk]]:
        logger.warning(
            "[MemoLM] Gateway at %s is unavailable; failing open to upstream LLM (%s at %s)",
            target_endpoint,
            self.upstream_provider,
            self.upstream_base_url,
        )
        upstream_url = f"{self.upstream_base_url.rstrip('/')}/chat/completions"
        upstream_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.upstream_api_key or ''}",
        }

        if stream:
            try:
                request = self._http_client.build_request(
                    "POST", upstream_url, headers=upstream_headers, json=payload
                )
                response = self._http_client.send(request, stream=True)
                if response.status_code >= 400:
                    response.read()
                    raise UpstreamProviderError(
                        f"Upstream direct fallback failed ({response.status_code}): {response.text}",
                        status_code=response.status_code,
                    )
                return create_sse_stream(response)
            except Exception as e:
                raise UpstreamProviderError(f"Direct upstream fallback failed: {e}") from e

        try:
            response = self._http_client.post(
                upstream_url, headers=upstream_headers, json=payload
            )
            if response.status_code >= 400:
                raise UpstreamProviderError(
                    f"Upstream direct fallback failed ({response.status_code}): {response.text}",
                    status_code=response.status_code,
                )
            self._session_metrics["total_requests"] += 1
            self._session_metrics["cache_misses"] += 1
            return ChatCompletion.model_validate(response.json())
        except Exception as e:
            raise UpstreamProviderError(f"Direct upstream fallback failed: {e}") from e

    def _post_chat_completion(
        self,
        messages: List[Union[Dict[str, Any], Message]],
        model: Optional[str] = None,
        knowledge_version: Optional[str] = None,
        tenant_id: Optional[str] = None,
        risk: Optional[str] = None,
        ttl_seconds: Optional[int] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        force_refresh: bool = False,
        cache_only: bool = False,
        similarity_threshold: Optional[float] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        extra_kwargs: Optional[Dict[str, Any]] = None,
    ) -> Union[ChatCompletion, Iterator[ChatCompletionChunk]]:
        target_endpoint = self._get_target_url()
        headers = self._prepare_headers(
            knowledge_version=knowledge_version,
            tenant_id=tenant_id,
            risk=risk,
            ttl_seconds=ttl_seconds,
            force_refresh=force_refresh,
            cache_only=cache_only,
            similarity_threshold=similarity_threshold,
            extra_headers=extra_headers,
        )

        formatted_messages = [
            m.model_dump() if isinstance(m, Message) else m for m in messages
        ]

        payload: Dict[str, Any] = {
            "model": model or self.default_model or "openai/gpt-oss-20b",
            "messages": formatted_messages,
        }

        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if stream:
            payload["stream"] = True
        if extra_kwargs:
            payload.update(extra_kwargs)

        # Streaming: no retry
        if stream:
            try:
                request = self._http_client.build_request(
                    "POST", target_endpoint, headers=headers, json=payload
                )
                response = self._http_client.send(request, stream=True)
            except (httpx.TimeoutException, httpx.RequestError) as exc:
                if self.fallback_to_upstream:
                    return self._execute_fallback(target_endpoint, payload, stream=True)
                raise GatewayUnavailableError(
                    f"Failed to connect to MemoLM Gateway at {target_endpoint}: {exc}"
                ) from exc

            if response.status_code >= 400:
                try:
                    response.read()
                    error_data = response.json()
                    err_msg = error_data.get("error", {}).get("message", response.text)
                    rejection_reasons = error_data.get("rejection_reasons") or error_data.get("error", {}).get("rejection_reasons", [])
                except Exception:
                    err_msg = response.text or f"HTTP {response.status_code}"
                    rejection_reasons = []

                response.close()
                if response.status_code == 404 and (cache_only or (isinstance(error_data, dict) and error_data.get("error", {}).get("type") == "cache_miss")):
                    raise CacheMissError(err_msg, status_code=404, response_body=error_data)
                if response.status_code == 502:
                    raise UpstreamProviderError(err_msg, status_code=response.status_code)
                if response.status_code == 400 and rejection_reasons:
                    self._record_safety_rejection(rejection_reasons)
                    raise SafetyGateRejectionError(err_msg, rejection_reasons=rejection_reasons, status_code=400)
                raise MemoLMError(err_msg, status_code=response.status_code)

            return create_sse_stream(response)

        # Non-streaming: retry on transient errors
        last_exc: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self._http_client.post(
                    target_endpoint, headers=headers, json=payload
                )
            except httpx.TimeoutException as exc:
                last_exc = GatewayUnavailableError(
                    f"Request to MemoLM Gateway timed out: {exc}"
                )
                if attempt < self.max_retries:
                    sleep_before_retry(attempt)
                    continue
                if self.fallback_to_upstream:
                    return self._execute_fallback(target_endpoint, payload, stream=False)
                raise last_exc from exc
            except httpx.RequestError as exc:
                if self.fallback_to_upstream:
                    return self._execute_fallback(target_endpoint, payload, stream=False)
                raise GatewayUnavailableError(
                    f"Failed to connect to MemoLM Gateway at {target_endpoint}: {exc}"
                ) from exc

            if response.status_code >= 400:
                try:
                    error_data = response.json()
                    err_msg = error_data.get("error", {}).get("message", response.text)
                    rejection_reasons = error_data.get("rejection_reasons") or error_data.get("error", {}).get("rejection_reasons", [])
                except Exception:
                    error_data = {}
                    err_msg = response.text or f"HTTP {response.status_code}"
                    rejection_reasons = []

                if response.status_code == 404 and (cache_only or (isinstance(error_data, dict) and error_data.get("error", {}).get("type") == "cache_miss")):
                    raise CacheMissError(err_msg, status_code=404, response_body=error_data)

                if should_retry(response.status_code) and attempt < self.max_retries:
                    sleep_before_retry(attempt, dict(response.headers))
                    continue

                if response.status_code == 502:
                    raise UpstreamProviderError(err_msg, status_code=response.status_code)
                if response.status_code == 400 and rejection_reasons:
                    self._record_safety_rejection(rejection_reasons)
                    raise SafetyGateRejectionError(err_msg, rejection_reasons=rejection_reasons, status_code=400)
                raise MemoLMError(err_msg, status_code=response.status_code)

            parsed = ChatCompletion.model_validate(response.json())
            self._record_stats(parsed.memolm_stats)
            return parsed

        raise MemoLMError("Unexpected retry loop exit")

    def __call__(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Union[ChatCompletion, Iterator[ChatCompletionChunk]]:
        """Convenience alias allowing `client(...)` to call `client.chat.completions.create(...)`."""
        return self.chat.completions.create(*args, **kwargs)

    def close(self) -> None:
        """Closes the underlying HTTP client if owned."""
        if self._owns_http_client:
            self._http_client.close()

    def __enter__(self) -> "MemoLM":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()
