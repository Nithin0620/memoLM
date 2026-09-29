from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator


class SafetyChecks(BaseModel):
    model_config = ConfigDict(extra="allow")

    tenant_valid: Optional[bool] = None
    model_valid: Optional[bool] = None
    prompt_version_valid: Optional[bool] = None
    knowledge_version_valid: Optional[bool] = None
    ttl_valid: Optional[bool] = None
    risk_policy_allowed: Optional[bool] = None


class MemoLMStats(BaseModel):
    model_config = ConfigDict(extra="allow")

    verdict: Optional[str] = None
    hit_type: Optional[str] = None
    similarity: float = 0.0
    latency_ms: float = 0.0
    latency_saved: float = 0.0
    latency_saved_ms: float = 0.0
    estimated_cost_usd: float = 0.0
    cost_saved: float = 0.0
    cost_incurred: float = 0.0
    safety_verdict: Optional[str] = None
    matched_query: Optional[str] = None
    rejection_reasons: List[str] = Field(default_factory=list)
    checks: Optional[SafetyChecks] = None
    payload: Optional[Dict[str, Any]] = None


class QAPair(BaseModel):
    model_config = ConfigDict(extra="allow")

    question: str
    answer: str
    tenant_id: str = "default-tenant"
    version: str = "v1"
    risk: str = "low"
    ttl_seconds: int = 864000
    provider: str = "seed"
    model: str = "all"


class SessionMetrics(dict):
    """
    Structured dictionary for session-level ROI metrics with custom string display.
    """
    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(f"'SessionMetrics' object has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value

    @property
    def total_requests(self) -> int:
        return self.get("total_requests", 0)

    @property
    def cache_hits(self) -> int:
        return self.get("cache_hits", 0)

    @property
    def cache_misses(self) -> int:
        return self.get("cache_misses", 0)

    @property
    def safety_rejections(self) -> int:
        return self.get("safety_rejections", 0)

    @property
    def hit_rate_pct(self) -> float:
        return self.get("hit_rate_pct", 0.0)

    @property
    def total_latency_saved_sec(self) -> float:
        return self.get("total_latency_saved_sec", 0.0)

    @property
    def estimated_cost_saved_usd(self) -> float:
        return self.get("estimated_cost_saved_usd", 0.0)

    def __str__(self) -> str:
        total = self.total_requests
        hits = self.cache_hits
        hit_rate = self.hit_rate_pct
        latency = int(self.total_latency_saved_sec)
        cost = self.estimated_cost_saved_usd
        return f"Total requests: {total} | Hits: {hits} ({hit_rate:.1f}%) | Latency Saved: {latency}s | Cost Saved: ${cost:.2f}"

    def __repr__(self) -> str:
        return self.__str__()


class Message(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: str
    content: str
    name: Optional[str] = None


class ChatChoiceMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: str = "assistant"
    content: Optional[str] = None


class ChatChoice(BaseModel):
    model_config = ConfigDict(extra="allow")

    index: int = 0
    message: ChatChoiceMessage
    finish_reason: Optional[str] = "stop"


class ChatUsage(BaseModel):
    model_config = ConfigDict(extra="allow")

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletion(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = "chatcmpl-memolm"
    object: str = "chat.completion"
    created: Optional[int] = None
    model: Optional[str] = None
    choices: List[ChatChoice] = Field(default_factory=list)
    usage: Optional[ChatUsage] = None
    memolm_stats: Optional[MemoLMStats] = None

    @model_validator(mode="before")
    @classmethod
    def populate_stats_alias(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Check for _memolm or memolm_stats or memolm_metadata
            stats_raw = data.get("memolm_stats") or data.get("_memolm") or data.get("memolm_metadata")
            if stats_raw is not None and "memolm_stats" not in data:
                data["memolm_stats"] = stats_raw
        return data

    @property
    def content(self) -> str:
        """Convenience property to access primary response text."""
        if self.choices and self.choices[0].message and self.choices[0].message.content:
            return self.choices[0].message.content
        return ""

    @property
    def memolm_metadata(self) -> Optional[MemoLMStats]:
        """Convenience alias for memolm_stats."""
        return self.memolm_stats


# Type alias for backward / design doc compatibility
MemoLMResponse = ChatCompletion


class ChatCompletionChunkDelta(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: Optional[str] = None
    content: Optional[str] = None


class ChatCompletionChunkChoice(BaseModel):
    model_config = ConfigDict(extra="allow")

    index: int = 0
    delta: ChatCompletionChunkDelta
    finish_reason: Optional[str] = None


class ChatCompletionChunk(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = "chatcmpl-memolm-chunk"
    object: str = "chat.completion.chunk"
    created: Optional[int] = None
    model: Optional[str] = None
    choices: List[ChatCompletionChunkChoice] = Field(default_factory=list)
    memolm_stats: Optional[MemoLMStats] = None

    @model_validator(mode="before")
    @classmethod
    def populate_stats_alias(cls, data: Any) -> Any:
        if isinstance(data, dict):
            stats_raw = data.get("memolm_stats") or data.get("_memolm") or data.get("memolm_metadata")
            if stats_raw is not None and "memolm_stats" not in data:
                data["memolm_stats"] = stats_raw
        return data

    @property
    def content(self) -> str:
        """Convenience property to access delta content."""
        if self.choices and self.choices[0].delta and self.choices[0].delta.content:
            return self.choices[0].delta.content
        return ""
