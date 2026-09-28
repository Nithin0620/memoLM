import json
from typing import Iterator, AsyncIterator, Optional, List
import httpx

from memolm.models import ChatCompletionChunk
from memolm.exceptions import UpstreamProviderError, MemoLMError, SafetyGateRejectionError


def _parse_sse_data(raw_data: str) -> Optional[ChatCompletionChunk]:
    data = raw_data.strip()
    if not data or data == "[DONE]":
        return None

    try:
        parsed = json.loads(data)
    except json.JSONDecodeError:
        return None

    if isinstance(parsed, dict) and "error" in parsed:
        err = parsed["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        err_type = err.get("type", "") if isinstance(err, dict) else ""
        rejection_reasons: List[str] = err.get("rejection_reasons", []) if isinstance(err, dict) else []

        if err_type == "upstream_error":
            raise UpstreamProviderError(msg, status_code=502, response_body=parsed)
        if err_type == "safety_rejected" or rejection_reasons:
            raise SafetyGateRejectionError(msg, rejection_reasons=rejection_reasons, response_body=parsed)
        raise MemoLMError(msg, status_code=500, response_body=parsed)

    return ChatCompletionChunk.model_validate(parsed)


def create_sse_stream(response: httpx.Response) -> Iterator[ChatCompletionChunk]:
    """
    Parses Server-Sent Events (SSE) from a synchronous HTTP stream.
    """
    try:
        for line in response.iter_lines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("data: "):
                data_str = line[6:]
                chunk = _parse_sse_data(data_str)
                if chunk is not None:
                    yield chunk
    finally:
        response.close()


async def create_async_sse_stream(response: httpx.Response) -> AsyncIterator[ChatCompletionChunk]:
    """
    Parses Server-Sent Events (SSE) from an asynchronous HTTP stream.
    """
    try:
        async for line in response.aiter_lines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("data: "):
                data_str = line[6:]
                chunk = _parse_sse_data(data_str)
                if chunk is not None:
                    yield chunk
    finally:
        await response.aclose()
