"""
Tests for retry logic and SafetyGateRejectionError.
"""
import pytest
import respx
import httpx
from unittest.mock import patch

from memolm import MemoLM, AsyncMemoLM, SafetyGateRejectionError, MemoLMError
from memolm._retry import compute_backoff, should_retry, get_retry_after


# ---------------------------------------------------------------------------
# Unit tests for retry helpers
# ---------------------------------------------------------------------------

def test_compute_backoff_stays_within_cap():
    for attempt in range(10):
        delay = compute_backoff(attempt, base=0.5, cap=8.0)
        assert 0 <= delay <= 8.0


def test_should_retry_codes():
    assert should_retry(429) is True
    assert should_retry(500) is True
    assert should_retry(503) is True
    assert should_retry(400) is False
    assert should_retry(502) is False  # upstream error, not retried
    assert should_retry(200) is False


def test_get_retry_after_parses_header():
    assert get_retry_after({"retry-after": "3"}) == 3.0
    assert get_retry_after({"Retry-After": "5.5"}) == 5.5
    assert get_retry_after({}) is None
    assert get_retry_after({}, default=1.0) == 1.0
    assert get_retry_after({"retry-after": "not-a-number"}) is None


# ---------------------------------------------------------------------------
# Sync client: retry on 429 / 503
# ---------------------------------------------------------------------------

@respx.mock
def test_sync_retries_on_429_then_succeeds():
    """Client should retry on 429 and succeed on the next attempt."""
    url = "http://localhost:8000/openai/v1/chat/completions"
    route = respx.post(url).mock(side_effect=[
        httpx.Response(429, json={"error": {"message": "rate limited"}}),
        httpx.Response(200, json={
            "id": "ok",
            "object": "chat.completion",
            "choices": [{"message": {"role": "assistant", "content": "retried ok"}}],
        }),
    ])

    client = MemoLM(max_retries=2)
    with patch("memolm._retry.time.sleep"):  # don't actually sleep in tests
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": "hi"}]
        )

    assert route.call_count == 2
    assert response.content == "retried ok"


@respx.mock
def test_sync_exhausts_retries_on_503():
    """After max_retries attempts, should raise MemoLMError."""
    url = "http://localhost:8000/openai/v1/chat/completions"
    respx.post(url).mock(return_value=httpx.Response(
        503, json={"error": {"message": "service unavailable"}}
    ))

    client = MemoLM(max_retries=2)
    with patch("memolm._retry.time.sleep"):
        with pytest.raises(MemoLMError) as exc_info:
            client.chat.completions.create(
                messages=[{"role": "user", "content": "hi"}]
            )
    assert exc_info.value.status_code == 503


@respx.mock
def test_sync_does_not_retry_on_400():
    """400 errors should NOT be retried — fail immediately."""
    url = "http://localhost:8000/openai/v1/chat/completions"
    route = respx.post(url).mock(return_value=httpx.Response(
        400, json={"error": {"message": "bad request"}}
    ))

    client = MemoLM(max_retries=2)
    with pytest.raises(MemoLMError):
        client.chat.completions.create(
            messages=[{"role": "user", "content": "hi"}]
        )
    assert route.call_count == 1  # no retry


# ---------------------------------------------------------------------------
# Sync client: SafetyGateRejectionError
# ---------------------------------------------------------------------------

@respx.mock
def test_sync_safety_gate_rejection():
    """400 with rejection_reasons should raise SafetyGateRejectionError."""
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            400,
            json={
                "error": {"message": "Safety Gate rejected the request"},
                "rejection_reasons": ["knowledge_version_mismatch", "risk_policy_exceeded"],
            }
        )
    )

    client = MemoLM()
    with pytest.raises(SafetyGateRejectionError) as exc_info:
        client.chat.completions.create(
            messages=[{"role": "user", "content": "hello"}]
        )

    err = exc_info.value
    assert err.status_code == 400
    assert "knowledge_version_mismatch" in err.rejection_reasons
    assert "risk_policy_exceeded" in err.rejection_reasons
    assert "knowledge_version_mismatch" in str(err)


# ---------------------------------------------------------------------------
# Async client: retry on 429 / SafetyGateRejectionError
# ---------------------------------------------------------------------------

@pytest.mark.anyio
@respx.mock
async def test_async_retries_on_429_then_succeeds():
    url = "http://localhost:8000/openai/v1/chat/completions"
    route = respx.post(url).mock(side_effect=[
        httpx.Response(429, json={"error": {"message": "rate limited"}}),
        httpx.Response(200, json={
            "id": "ok-async",
            "object": "chat.completion",
            "choices": [{"message": {"role": "assistant", "content": "async retried"}}],
        }),
    ])

    async with AsyncMemoLM(max_retries=2) as client:
        with patch("asyncio.sleep"):
            response = await client.chat.completions.create(
                messages=[{"role": "user", "content": "hi"}]
            )

    assert route.call_count == 2
    assert response.content == "async retried"


@pytest.mark.anyio
@respx.mock
async def test_async_safety_gate_rejection():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            400,
            json={
                "error": {"message": "Safety Gate rejected"},
                "rejection_reasons": ["tenant_invalid"],
            }
        )
    )

    async with AsyncMemoLM() as client:
        with pytest.raises(SafetyGateRejectionError) as exc_info:
            await client.chat.completions.create(
                messages=[{"role": "user", "content": "hello"}]
            )

    assert "tenant_invalid" in exc_info.value.rejection_reasons
