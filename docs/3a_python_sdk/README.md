# 3a. MemoLM Python SDK (`memolm-py`) 🐍

**Owner:** Python SDK Developer  
**Tech Stack:** Python 3.9+, `httpx` or `openai` wrapper, `pydantic`

---

## 🎯 Goal & Responsibilities
Create an intuitive, type-safe, and lightweight Python SDK that developers can pip-install and integrate with 3 lines of code.

---

## 📋 Detailed Requirements

### 1. Package Structure
```
sdk/python/
├── memolm/
│   ├── __init__.py
│   ├── client.py
│   ├── models.py
│   └── exceptions.py
├── pyproject.toml
└── README.md
```

### 2. Client Interface Design
```python
from memolm import MemoLM

client = MemoLM(
    base_url="http://localhost:8000/v1",  # or https://api.memolm.dev/v1
    api_key="your-memolm-api-key",        # optional
    default_tenant="default",
    default_knowledge_version="v1"
)

# Synchronous Chat Completion
response = client.chat(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a customer support agent."},
        {"role": "user", "content": "How do I get a refund?"}
    ],
    knowledge_version="v12",
    risk="low",
    tenant_id="customer_123"
)

# Access standard OpenAI response fields
print(response.choices[0].message.content)

# Access rich MemoLM explainability metadata
print(response.memolm_metadata.hit_type)           # "SEMANTIC_CACHE_HIT"
print(response.memolm_metadata.similarity)         # 0.942
print(response.memolm_metadata.latency_saved_ms)   # 1120.5
print(response.memolm_metadata.safety_verdict)     # "SAFE"
```

### 3. Async Support
```python
# Async client support
async_client = MemoLM.Async(base_url="http://localhost:8000/v1")
response = await async_client.chat(...)
```

### 4. Key Responsibilities
* Map keyword arguments (`knowledge_version`, `tenant_id`, `risk`) to `x-memolm-*` headers.
* Parse the gateway response and attach the custom `_memolm` response block into a clean Python typed object (`MemoLMMetadata`).
* Provide seamless error handling for network timeouts or gateway unreachable states (with fallback mode options).
