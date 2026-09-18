# 2. Core Engine: Safety Gate & Provider Specifications 🛡️🔌

**Module:** `2_core_engine`  
**Purpose:** Detailed algorithmic logic for the Safety Gate, provider adapters, and exact schema contracts.

---

## 🛡️ 1. The Safety Gate Engine Specification (`safety_gate.py`)

The Safety Gate evaluates every semantic candidate returned from Qdrant before it is allowed to be served.

### Input Parameters:
* `candidate`: The cached vector record retrieved from Qdrant.
* `request_context`: The incoming request parameters (`tenant_id`, `provider`, `model`, `knowledge_version`, `prompt_version`, `risk_level`).
* `similarity_score`: Cosine similarity float between incoming query and cached query.

### Algorithm & Logic:
```python
import time
from typing import List, Tuple
from app.models.memolm_schema import SafetyVerdict, SafetyChecks

RISK_THRESHOLDS = {
    "low": 0.88,
    "medium": 0.93,
    "high": 0.98  # Or disabled completely
}

class SafetyGate:
    @staticmethod
    def evaluate(candidate: dict, req: dict, similarity: float) -> Tuple[SafetyVerdict, List[str], SafetyChecks]:
        reasons: List[str] = []
        checks = SafetyChecks(
            tenant_valid=True,
            model_valid=True,
            prompt_version_valid=True,
            knowledge_version_valid=True,
            ttl_valid=True,
            risk_policy_allowed=True
        )

        # 1. Tenant Check
        if candidate["tenant_id"] != req["tenant_id"]:
            checks.tenant_valid = False
            reasons.append("tenant_mismatch")

        # 2. Model & Provider Match
        if candidate["model"] != req["model"] or candidate["provider"] != req["provider"]:
            checks.model_valid = False
            reasons.append("model_or_provider_mismatch")

        # 3. Prompt Version Match
        if candidate.get("prompt_version") != req.get("prompt_version"):
            checks.prompt_version_valid = False
            reasons.append("prompt_version_mismatch")

        # 4. Knowledge Version Check (CRITICAL)
        if candidate["knowledge_version"] != req["knowledge_version"]:
            checks.knowledge_version_valid = False
            reasons.append(
                f"knowledge_version_mismatch: cached={candidate['knowledge_version']}, requested={req['knowledge_version']}"
            )

        # 5. TTL Expiration Check
        now = int(time.time())
        created_at = candidate.get("created_at", now)
        ttl = candidate.get("ttl_seconds", 86400)
        if now > (created_at + ttl):
            checks.ttl_valid = False
            reasons.append(f"ttl_expired: expired {now - (created_at + ttl)}s ago")

        # 6. Risk Policy Check
        risk_level = req.get("risk", "low").lower()
        if risk_level == "high":
            checks.risk_policy_allowed = False
            reasons.append("high_risk_policy_disables_semantic_cache")
        else:
            required_threshold = RISK_THRESHOLDS.get(risk_level, 0.90)
            if similarity < required_threshold:
                checks.risk_policy_allowed = False
                reasons.append(f"below_risk_threshold: similarity {similarity:.3f} < required {required_threshold}")

        verdict = SafetyVerdict.SAFE if len(reasons) == 0 else SafetyVerdict.REJECTED
        return verdict, reasons, checks
```

---

## 🔌 2. Provider Adapters Specification (`providers/`)

### Unified Internal Interface:
```python
from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate_chat_completion(
        self, 
        model: str, 
        messages: list, 
        temperature: float = 0.7, 
        **kwargs
    ) -> Dict[str, Any]:
        """
        Must return normalized OpenAI Chat Completion dict:
        {
          "id": str,
          "object": "chat.completion",
          "created": int,
          "model": str,
          "choices": [{"index": 0, "message": {"role": "assistant", "content": str}, "finish_reason": "stop"}],
          "usage": {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int}
        }
        """
        pass
```

### 1. OpenAI Adapter (`openai_adapter.py`)
Direct asynchronous call using `openai.AsyncOpenAI` client.

### 2. Gemini Adapter (`gemini_adapter.py`)
Translates standard OpenAI `messages` format (`[{"role": "user", "content": ...}]`) into Gemini's `contents` format (`[{"role": "user", "parts": [...]}]`), calls `google-generativeai` (or raw REST HTTP), and shapes the output into standard OpenAI response schema.

---

## 📊 3. Internal Metrics & Audit API Contracts

### `GET /api/metrics`
```json
{
  "total_requests": 12483,
  "exact_hits": 4820,
  "semantic_hits": 4394,
  "llm_calls": 3269,
  "cache_hit_rate_pct": 73.8,
  "estimated_cost_saved_usd": 11.71,
  "total_latency_saved_sec": 10420.5,
  "rejection_counts": {
    "knowledge_changed": 214,
    "ttl_expired": 152,
    "tenant_mismatch": 91,
    "prompt_changed": 83,
    "risk_policy": 48
  }
}
```

### `GET /api/audit-stream` (Server-Sent Events)
Streams real-time JSON logs on every incoming request:
```json
{
  "timestamp": "2026-09-19T01:30:00Z",
  "request_id": "req-9912",
  "query": "Can I get a refund?",
  "provider": "openai",
  "model": "gpt-4o",
  "status": "SAFETY_REJECTED",
  "rejection_reasons": ["knowledge_version_mismatch: cached=v12, requested=v13"],
  "latency_ms": 1180.2,
  "cost_usd": 0.0031
}
```
