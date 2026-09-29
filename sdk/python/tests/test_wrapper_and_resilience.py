"""
Unit tests for wrap_openai, fail-open resilience, telemetry callbacks, and per-request flags.
"""
import pytest
import respx
import httpx
from unittest.mock import MagicMock

from memolm import MemoLM, AsyncMemoLM, wrap_openai, GatewayUnavailableError


def test_wrap_openai_sync_interface():
    # Mock an openai-like client
    mock_openai = MagicMock()
    mock_openai.chat.completions.create.return_value = {"id": "upstream_ok"}
    mock_openai.api_key = "test-sk"
    mock_openai.__class__.__name__ = "OpenAI"

    wrapped = wrap_openai(
        mock_openai,
        gateway_url="http://localhost:8000",
        knowledge_version="v12",
        tenant_id="test-corp",
        risk="low",
    )

    assert hasattr(wrapped, "chat")
    assert hasattr(wrapped.chat, "completions")
    assert hasattr(wrapped.chat.completions, "create")
    assert hasattr(wrapped, "get_session_metrics")


@respx.mock
def test_wrap_openai_routes_through_gateway():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "chatcmpl-cached",
                "object": "chat.completion",
                "choices": [{"message": {"role": "assistant", "content": "from cache"}}],
                "memolm_stats": {
                    "verdict": "SAFE_CACHE_HIT",
                    "similarity": 0.98,
                    "latency_saved": 1200.0,
                },
            },
        )
    )

    mock_openai = MagicMock()
    mock_openai.api_key = "test-sk"
    mock_openai.__class__.__name__ = "OpenAI"

    wrapped = wrap_openai(
        mock_openai,
        gateway_url="http://localhost:8000",
        knowledge_version="v12",
    )

    res = wrapped.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hi"}],
    )

    assert res.content == "from cache"
    metrics = wrapped.get_session_metrics()
    assert metrics["total_requests"] == 1
    assert metrics["cache_hits"] == 1
    assert metrics["hit_rate_pct"] == 100.0


def test_wrap_openai_fail_open_to_original():
    # Gateway unreachable
    mock_openai = MagicMock()
    mock_openai.api_key = "test-sk"
    mock_openai.__class__.__name__ = "OpenAI"
    mock_openai.chat.completions.create.return_value = MagicMock(content="direct from openai")

    wrapped = wrap_openai(
        mock_openai,
        gateway_url="http://non-existent-gateway-12345.local",
        fallback_to_upstream=True,
    )

    # Calling create should NOT crash — it should fail open to mock_openai
    res = wrapped.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hi"}],
    )

    assert mock_openai.chat.completions.create.called
    assert res.content == "direct from openai"


@respx.mock
def test_per_request_flags_and_headers():
    route = respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "chatcmpl-fresh",
                "object": "chat.completion",
                "choices": [{"message": {"role": "assistant", "content": "fresh reply"}}],
            },
        )
    )

    client = MemoLM(base_url="http://localhost:8000", max_retries=0)
    res = client.chat.completions.create(
        messages=[{"role": "user", "content": "test"}],
        force_refresh=True,
        cache_only=False,
        similarity_threshold=0.94,
    )

    assert route.called
    sent_headers = route.calls.last.request.headers
    assert sent_headers["x-memolm-force-refresh"] == "true"
    assert sent_headers["x-memolm-similarity-threshold"] == "0.94"
    assert res.content == "fresh reply"


@respx.mock
def test_telemetry_callbacks():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "ok",
                "object": "chat.completion",
                "choices": [{"message": {"role": "assistant", "content": "hit!"}}],
                "memolm_stats": {
                    "verdict": "SAFE_CACHE_HIT",
                    "similarity": 0.99,
                    "latency_saved": 950.0,
                },
            },
        )
    )

    hit_called = []
    miss_called = []

    client = MemoLM(
        base_url="http://localhost:8000",
        on_cache_hit=lambda stats: hit_called.append(stats),
        on_cache_miss=lambda stats: miss_called.append(stats),
    )

    client.chat.completions.create(messages=[{"role": "user", "content": "hello"}])

    assert len(hit_called) == 1
    assert hit_called[0].similarity == 0.99
    assert len(miss_called) == 0

    metrics = client.get_session_metrics()
    assert metrics["total_requests"] == 1
    assert metrics["cache_hits"] == 1


@pytest.mark.anyio
@respx.mock
async def test_async_wrap_openai():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "async-cached",
                "object": "chat.completion",
                "choices": [{"message": {"role": "assistant", "content": "async response"}}],
                "memolm_stats": {"verdict": "SAFE_CACHE_HIT", "similarity": 0.97},
            },
        )
    )

    class FakeAsyncOpenAI:
        _is_async = True
        api_key = "test-sk"
        class Chat:
            class Completions:
                async def create(self, *args, **kwargs):
                    return "fallback"
            completions = Completions()
        chat = Chat()

    fake_client = FakeAsyncOpenAI()
    wrapped = wrap_openai(fake_client, gateway_url="http://localhost:8000")

    res = await wrapped.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hello"}],
    )
    assert res.content == "async response"
    assert wrapped.get_session_metrics()["cache_hits"] == 1

