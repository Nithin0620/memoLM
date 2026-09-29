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
    QAPair,
    SessionMetrics,
)
from memolm.exceptions import (
    MemoLMError,
    GatewayUnavailableError,
    UpstreamProviderError,
    SafetyGateRejectionError,
    CacheMissError,
)
from memolm.cache import CacheClient, AsyncCacheClient
from memolm.wrapper import wrap_openai

# Convenience alias for MemoLM.Async(...)
MemoLM.Async = AsyncMemoLM  # type: ignore

__version__ = "0.1.0"
__all__ = [
    "MemoLM",
    "AsyncMemoLM",
    "wrap_openai",
    "ChatCompletion",
    "MemoLMResponse",
    "ChatCompletionChunk",
    "MemoLMStats",
    "SafetyChecks",
    "Message",
    "QAPair",
    "SessionMetrics",
    "CacheClient",
    "AsyncCacheClient",
    "MemoLMError",
    "GatewayUnavailableError",
    "UpstreamProviderError",
    "SafetyGateRejectionError",
    "CacheMissError",
]
