"""
Official Python SDK for MemoLM.
Safe Semantic Caching & Response Firewall for LLMs.
"""

from memolm.client import MemoLM
from memolm.async_client import AsyncMemoLM
from memolm.models import (
    ChatCompletion,
    MemoLMResponse,
    ChatCompletionChunk,
    MemoLMStats,
    SafetyChecks,
    Message,
)
from memolm.exceptions import (
    MemoLMError,
    GatewayUnavailableError,
    UpstreamProviderError,
)

# Convenience alias for MemoLM.Async(...)
MemoLM.Async = AsyncMemoLM  # type: ignore

__version__ = "0.1.0"
__all__ = [
    "MemoLM",
    "AsyncMemoLM",
    "ChatCompletion",
    "MemoLMResponse",
    "ChatCompletionChunk",
    "MemoLMStats",
    "SafetyChecks",
    "Message",
    "MemoLMError",
    "GatewayUnavailableError",
    "UpstreamProviderError",
]
