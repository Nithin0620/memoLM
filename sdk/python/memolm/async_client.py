from typing import List, Dict, Optional, Any, Union, AsyncIterator, overload, Literal
import httpx

from memolm.models import ChatCompletion, ChatCompletionChunk, Message
from memolm.exceptions import MemoLMError, UpstreamProviderError, GatewayUnavailableError
from memolm.streaming import create_async_sse_stream


class AsyncCompletions:
    def __init__(self, client: "AsyncMemoLM") -> None:
        self._client = client

    @overload
    async def create(
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
        extra_headers: Optional[Dict[str, str]] = None,
        **extra_kwargs: Any,
    ) -> ChatCompletion: ...

    @overload
    async def create(
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
        extra_headers: Optional[Dict[str, str]] = None,
        **extra_kwargs: Any,
    ) -> AsyncIterator[ChatCompletionChunk]: ...

    async def create(
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
        extra_headers: Optional[Dict[str, str]] = None,
        **extra_kwargs: Any,
    ) -> Union[ChatCompletion, AsyncIterator[ChatCompletionChunk]]:
        """
        Asynchronously creates a model response for the given chat conversation.
        Intercepts requests through the MemoLM Safety Gate and Semantic Cache.
        """
        return await self._client._post_chat_completion(
            messages=messages,
            model=model,
            knowledge_version=knowledge_version,
            tenant_id=tenant_id,
            risk=risk,
            ttl_seconds=ttl_seconds,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
            extra_headers=extra_headers,
            extra_kwargs=extra_kwargs,
        )


class AsyncChat:
    def __init__(self, client: "AsyncMemoLM") -> None:
        self.completions = AsyncCompletions(client)


class AsyncMemoLM:
    """
    Asynchronous MemoLM client for OpenAI-compatible chat completions with
    built-in semantic caching and Safety Gate verification.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        api_key: str = "memo-key",
        default_tenant: str = "default-tenant",
        default_knowledge_version: str = "v1",
        default_risk: str = "low",
        default_model: Optional[str] = None,
        default_headers: Optional[Dict[str, str]] = None,
        timeout: float = 60.0,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_tenant = default_tenant
        self.default_knowledge_version = default_knowledge_version
        self.default_risk = default_risk
        self.default_model = default_model
        self.default_headers = default_headers or {}
        self.timeout = timeout

        self._http_client = http_client or httpx.AsyncClient(timeout=timeout)
        self._owns_http_client = http_client is None

        self.chat = AsyncChat(self)

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

        if extra_headers:
            headers.update(extra_headers)

        return headers

    async def _post_chat_completion(
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
        extra_headers: Optional[Dict[str, str]] = None,
        extra_kwargs: Optional[Dict[str, Any]] = None,
    ) -> Union[ChatCompletion, AsyncIterator[ChatCompletionChunk]]:
        target_endpoint = self._get_target_url()
        headers = self._prepare_headers(
            knowledge_version=knowledge_version,
            tenant_id=tenant_id,
            risk=risk,
            ttl_seconds=ttl_seconds,
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

        if stream:
            try:
                request = self._http_client.build_request(
                    "POST", target_endpoint, headers=headers, json=payload
                )
                response = await self._http_client.send(request, stream=True)
            except httpx.RequestError as exc:
                raise GatewayUnavailableError(
                    f"Failed to connect to MemoLM Gateway at {target_endpoint}: {exc}"
                ) from exc

            if response.status_code >= 400:
                try:
                    await response.aread()
                    error_data = response.json()
                    err_msg = error_data.get("error", {}).get("message", response.text)
                except Exception:
                    err_msg = response.text or f"HTTP {response.status_code}"

                await response.aclose()
                if response.status_code == 502:
                    raise UpstreamProviderError(
                        err_msg, status_code=response.status_code
                    )
                raise MemoLMError(err_msg, status_code=response.status_code)

            return create_async_sse_stream(response)

        try:
            response = await self._http_client.post(
                target_endpoint, headers=headers, json=payload
            )
        except httpx.RequestError as exc:
            raise GatewayUnavailableError(
                f"Failed to connect to MemoLM Gateway at {target_endpoint}: {exc}"
            ) from exc

        if response.status_code >= 400:
            try:
                error_data = response.json()
                err_msg = error_data.get("error", {}).get("message", response.text)
            except Exception:
                err_msg = response.text or f"HTTP {response.status_code}"

            if response.status_code == 502:
                raise UpstreamProviderError(err_msg, status_code=response.status_code)
            raise MemoLMError(err_msg, status_code=response.status_code)

        data = response.json()
        return ChatCompletion.model_validate(data)

    async def __call__(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Union[ChatCompletion, AsyncIterator[ChatCompletionChunk]]:
        """Convenience alias allowing `await client(...)` to call `await client.chat.completions.create(...)`."""
        return await self.chat.completions.create(*args, **kwargs)

    async def close(self) -> None:
        """Closes the underlying HTTP client if owned."""
        if self._owns_http_client:
            await self._http_client.aclose()

    async def __aenter__(self) -> "AsyncMemoLM":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()
