import pytest
import respx
import httpx
from memolm import MemoLM, AsyncMemoLM, UpstreamProviderError


@respx.mock
def test_sync_streaming_chat():
    sse_body = (
        'data: {"id": "c1", "object": "chat.completion.chunk", "choices": [{"delta": {"content": "Hello"}}]}\n\n'
        'data: {"id": "c2", "object": "chat.completion.chunk", "choices": [{"delta": {"content": " world!"}}]}\n\n'
        'data: [DONE]\n\n'
    )

    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            text=sse_body,
            headers={"content-type": "text/event-stream"}
        )
    )

    client = MemoLM()
    stream = client.chat.completions.create(
        messages=[{"role": "user", "content": "Stream test"}],
        stream=True
    )

    chunks = list(stream)
    assert len(chunks) == 2
    assert chunks[0].content == "Hello"
    assert chunks[1].content == " world!"


@pytest.mark.anyio
@respx.mock
async def test_async_streaming_chat():
    sse_body = (
        'data: {"id": "c1", "object": "chat.completion.chunk", "choices": [{"delta": {"content": "Async"}}]}\n\n'
        'data: {"id": "c2", "object": "chat.completion.chunk", "choices": [{"delta": {"content": " stream"}}]}\n\n'
        'data: [DONE]\n\n'
    )

    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            text=sse_body,
            headers={"content-type": "text/event-stream"}
        )
    )

    async with AsyncMemoLM() as client:
        stream = await client.chat.completions.create(
            messages=[{"role": "user", "content": "Async stream test"}],
            stream=True
        )

        chunks = []
        async for chunk in stream:
            chunks.append(chunk)

    assert len(chunks) == 2
    assert chunks[0].content == "Async"
    assert chunks[1].content == " stream"


@pytest.mark.anyio
@respx.mock
async def test_streaming_upstream_error_event():
    sse_body = (
        'data: {"error": {"message": "Stream interrupted by upstream", "type": "upstream_error"}}\n\n'
        'data: [DONE]\n\n'
    )

    respx.post("http://localhost:8000/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            text=sse_body,
            headers={"content-type": "text/event-stream"}
        )
    )

    async with AsyncMemoLM() as client:
        stream = await client.chat.completions.create(
            messages=[{"role": "user", "content": "Stream error test"}],
            stream=True
        )

        with pytest.raises(UpstreamProviderError) as exc_info:
            async for _ in stream:
                pass

        assert "Stream interrupted by upstream" in str(exc_info.value)
