import pytest
import respx
import httpx
from memolm import MemoLM, MemoLMError, UpstreamProviderError, GatewayUnavailableError
from memolm.models import Message


def test_client_init_defaults():
    client = MemoLM()
    assert client.base_url == "http://localhost:8000"
    assert client.api_key == "memo-key"
    assert client.default_tenant == "default-tenant"
    assert client.default_knowledge_version == "v1"
    assert client.default_risk == "low"
    assert client._get_target_url() == "http://localhost:8000/openai/v1/chat/completions"


def test_client_url_variations():
    client1 = MemoLM(base_url="http://localhost:8000/v1/")
    assert client1._get_target_url() == "http://localhost:8000/v1/chat/completions"

    client2 = MemoLM(base_url="http://localhost:8000/openai/v1")
    assert client2._get_target_url() == "http://localhost:8000/openai/v1/chat/completions"


@respx.mock
def test_sync_chat_cache_hit():
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
                            "content": "A refund takes 3-5 business days."
                        },
                        "finish_reason": "stop"
                    }
                ],
                "memolm_stats": {
                    "verdict": "SAFE_CACHE_HIT",
                    "similarity": 0.965,
                    "latency_saved": 1150.0,
                    "payload": {
                        "response": "A refund takes 3-5 business days.",
                        "version": "v12"
                    }
                }
            }
        )
    )

    client = MemoLM(base_url="http://localhost:8000")
    response = client.chat.completions.create(
        messages=[{"role": "user", "content": "How long for a refund?"}],
        knowledge_version="v12",
        tenant_id="acme-corp",
        risk="low"
    )

    assert mock_route.called
    sent_request = mock_route.calls.last.request
    assert sent_request.headers["x-memolm-tenant"] == "acme-corp"
    assert sent_request.headers["x-memolm-version"] == "v12"
    assert sent_request.headers["x-memolm-risk"] == "low"
    assert sent_request.headers["authorization"] == "Bearer memo-key"

    assert response.id == "chatcmpl-memolm-cache"
    assert response.content == "A refund takes 3-5 business days."
    assert response.memolm_stats is not None
    assert response.memolm_stats.verdict == "SAFE_CACHE_HIT"
    assert response.memolm_stats.similarity == 0.965
    assert response.memolm_stats.latency_saved == 1150.0


@respx.mock
def test_sync_chat_with_message_objects():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "chatcmpl-llm-123",
                "object": "chat.completion",
                "choices": [{"message": {"role": "assistant", "content": "Hello!"}}],
            }
        )
    )

    client = MemoLM()
    msg = Message(role="user", content="Hi")
    response = client.chat.completions.create(messages=[msg])
    assert response.content == "Hello!"


@respx.mock
def test_sync_chat_upstream_error_502():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            502,
            json={"error": {"message": "Groq rate limit exceeded", "type": "upstream_error"}}
        )
    )

    client = MemoLM()
    with pytest.raises(UpstreamProviderError) as exc_info:
        client.chat.completions.create(
            messages=[{"role": "user", "content": "Hello"}]
        )
    assert "Groq rate limit exceeded" in str(exc_info.value)
    assert exc_info.value.status_code == 502


@respx.mock
def test_sync_chat_gateway_error_400():
    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            400,
            json={"error": {"message": "Invalid request parameters"}}
        )
    )

    client = MemoLM()
    with pytest.raises(MemoLMError) as exc_info:
        client.chat.completions.create(
            messages=[{"role": "user", "content": "Hello"}]
        )
    assert "Invalid request parameters" in str(exc_info.value)
    assert exc_info.value.status_code == 400


def test_sync_chat_connection_error():
    client = MemoLM(base_url="http://non-existent-domain-12345.local")
    with pytest.raises(GatewayUnavailableError):
        client.chat.completions.create(
            messages=[{"role": "user", "content": "Hello"}]
        )
