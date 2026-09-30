# 3a. Python SDK: Architecture & Implementation Plan 🐍

**Module:** `3a_python_sdk`  
**Target:** Python 3.9+, Pydantic v2, HTTPX, Flit / Poetry / Hatchling for packaging

---

## 🏛️ 1. Design Philosophy

The MemoLM Python SDK (`memolm-py`) gives Python AI developers a first-class, typed interface to interact with MemoLM.

* **Ultra-low footprint:** Minimal dependencies (`httpx`, `pydantic`).
* **Zero mental overhead:** Mirrored after the official `openai-python` client.
* **First-class Safety Parameters:** Explicit function arguments for `knowledge_version`, `tenant_id`, and `risk`.
* **Rich Explainability:** Returns standard responses with a typed `.memolm_metadata` attribute.

---

## 📁 2. Package Structure

```
sdk/python/
├── pyproject.toml
├── README.md
├── memolm/
│   ├── __init__.py               # Exports MemoLM, AsyncMemoLM, MemoLMError
│   ├── client.py                 # Synchronous MemoLM client
│   ├── async_client.py           # Asynchronous AsyncMemoLM client
│   ├── models.py                 # Typed Pydantic models for responses & _memolm
│   └── exceptions.py             # MemoLMException, GatewayUnavailableError
└── tests/
    ├── test_client.py
    └── test_async_client.py
```

---

## 🧩 3. Core Implementation Specification

### `memolm/models.py`
```python
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class SafetyChecks(BaseModel):
    tenant_valid: bool
    model_valid: bool
    prompt_version_valid: bool
    knowledge_version_valid: bool
    ttl_valid: bool
    risk_policy_allowed: bool

class MemoLMMetadata(BaseModel):
    hit_type: str = Field(..., description="EXACT_CACHE_HIT, SEMANTIC_CACHE_HIT, LLM_CALL, or SAFETY_REJECTED")
    similarity: float = 0.0
    latency_ms: float = 0.0
    estimated_cost_usd: float = 0.0
    safety_verdict: str = "SAFE"
    matched_query: Optional[str] = None
    rejection_reasons: List[str] = []
    checks: Optional[SafetyChecks] = None

class ChatChoiceMessage(BaseModel):
    role: str
    content: str

class ChatChoice(BaseModel):
    index: int
    message: ChatChoiceMessage
    finish_reason: Optional[str] = "stop"

class ChatUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class MemoLMResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatChoice]
    usage: ChatUsage
    memolm_metadata: MemoLMMetadata = Field(..., alias="_memolm")

    @property
    def content(self) -> str:
        """Convenience helper to get primary response content"""
        if self.choices:
            return self.choices[0].message.content
        return ""
```

### `memolm/client.py`
```python
import httpx
from typing import List, Dict, Optional, Any
from memolm.models import MemoLMResponse
from memolm.exceptions import MemoLMError

class MemoLM:
    def __init__(
        self,
        base_url: str = "http://localhost:8000/v1",
        api_key: Optional[str] = None,
        default_tenant: str = "default",
        default_knowledge_version: str = "v1",
        timeout: float = 60.0
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or "sk-memolm-dummy"
        self.default_tenant = default_tenant
        self.default_knowledge_version = default_knowledge_version
        self.http_client = httpx.Client(timeout=timeout)

    def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        tenant_id: Optional[str] = None,
        knowledge_version: Optional[str] = None,
        risk: str = "low",
        ttl_seconds: int = 86400,
        **extra_kwargs
    ) -> MemoLMResponse:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "x-memolm-tenant": tenant_id or self.default_tenant,
            "x-memolm-knowledge-version": knowledge_version or self.default_knowledge_version,
            "x-memolm-risk": risk,
            "x-memolm-ttl": str(ttl_seconds)
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            **extra_kwargs
        }

        response = self.http_client.post(
            f"{self.base_url}/chat/completions",
            headers=headers,
            json=payload
        )

        if response.status_code != 200:
            raise MemoLMError(f"Gateway Error ({response.status_code}): {response.text}")

        return MemoLMResponse.model_validate(response.json())
```

---

## ⚡ 4. Implementation Milestones for Python SDK Dev

1. **Milestone 1: Client Core & Models (Hours 1–2):** Build sync and async clients with header injection and response unmarshaling.
2. **Milestone 2: Unit Testing (Hours 3–4):** Mock gateway with `respx` and verify exact and semantic metadata parsing.
3. **Milestone 3: PyPI Packaging & Readme (Hours 5):** Setup `pyproject.toml` with build tools.
