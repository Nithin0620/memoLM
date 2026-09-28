import pytest
import respx
import httpx
from memolm import AsyncMemoLM, MemoLM, UpstreamProviderError, GatewayUnavailableError


@pytest.mark.anyio
async def test_async_client_init():
    client = AsyncMemoLM()
    assert client.base_url == "http://localhost:8000"
    assert client.default_tenant == "default-tenant"
    await client.close()


@pytest.mark.anyio
@respx.mock
async def test_async_chat_cache_hit():
    mock_route = respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "chatcmpl-memolm-cache",
                "object": "chat.completion",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "Async response content"
                        },
                        "finish_reason": "stop"
                    }
                ],
                "_memolm": {
                    "hit_type": "SEMANTIC_CACHE_HIT",
                    "similarity": 0.97,
                    "latency_saved": 850.0,
                    "safety_verdict": "SAFE"
                }
            }
        )
    )

    async with AsyncMemoLM(base_url="http://localhost:8000") as client:
        response = await client.chat.completions.create(
            messages=[{"role": "user", "content": "Async question"}],
            knowledge_version="v2",
            tenant_id="tenant-async",
            risk="medium"
        )

    assert mock_route.called
    sent_request = mock_route.calls.last.request
    assert sent_request.headers["x-memolm-tenant"] == "tenant-async"
    assert sent_request.headers["x-memolm-version"] == "v2"
    assert sent_request.headers["x-memolm-risk"] == "medium"

    assert response.content == "Async response content"
    assert response.memolm_metadata is not None
    assert response.memolm_metadata.hit_type == "SEMANTIC_CACHE_HIT"
    assert response.memolm_metadata.similarity == 0.97
    assert response.memolm_metadata.safety_verdict == "SAFE"


@pytest.mark.anyio
@respx.mock
async def test_async_chat_error_handling():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            502,
            json={"error": {"message": "Groq upstream failure", "type": "upstream_error"}}
        )
    )

    async with AsyncMemoLM() as client:
        with pytest.raises(UpstreamProviderError) as exc_info:
            await client.chat.completions.create(
                messages=[{"role": "user", "content": "Hello"}]
            )
        assert "Groq upstream failure" in str(exc_info.value)
