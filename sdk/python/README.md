# memolm (`memolm-py`) ⚡🛡️

The official Python SDK for **MemoLM** — the intelligent LLM response firewall and safe semantic cache gateway.

---

## 📦 Installation

```bash
pip install memolm
# or for local development in this repository:
pip install -e sdk/python
```

---

## 🚀 Quickstart

### 1. Initialize the Client

```python
from memolm import MemoLM

client = MemoLM(
    base_url="http://localhost:8000",   # URL of your MemoLM Gateway
    api_key="memo-key",                 # Optional for local/self-hosted
    default_knowledge_version="v12",     # Default knowledge version for Safety Gate
    default_tenant="acme-corp",         # Default tenant namespace
    default_risk="low"                  # Default risk level
)
```

---

### 2. Standard Chat Completion (Sync Mode)

```python
response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[
        {"role": "system", "content": "You are a customer support agent."},
        {"role": "user", "content": "What is the return policy?"}
    ],
    knowledge_version="v12",  # First-class Safety Gate check
    tenant_id="acme-corp",
    risk="low"
)

# Access primary response text
print(response.content)

# Explainability & Cache Metadata
if response.memolm_stats:
    print(f"Cache Verdict: {response.memolm_stats.verdict or response.memolm_stats.hit_type}")
    print(f"Similarity: {response.memolm_stats.similarity}")
    print(f"Latency Saved: {response.memolm_stats.latency_saved}ms")
```

---

### 3. Asynchronous Client (`AsyncMemoLM`)

```python
import asyncio
from memolm import AsyncMemoLM

async def main():
    async with AsyncMemoLM(base_url="http://localhost:8000") as client:
        response = await client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": "How do refunds work?"}],
            knowledge_version="v12",
        )
        print(response.content)

asyncio.run(main())
```

---

### 4. Real-Time Streaming (SSE)

#### Synchronous Streaming:
```python
stream = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "Explain quantum computing briefly."}],
    knowledge_version="v12",
    stream=True,
)

for chunk in stream:
    if chunk.content:
        print(chunk.content, end="", flush=True)
print()
```

#### Asynchronous Streaming:
```python
async with AsyncMemoLM(base_url="http://localhost:8000") as async_client:
    stream = await async_client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": "Explain quantum computing briefly."}],
        knowledge_version="v12",
        stream=True,
    )

    async for chunk in stream:
        if chunk.content:
            print(chunk.content, end="", flush=True)
    print()
```

---

## 🛡️ The Safety Gate & Instant Invalidation

When business rules, policies, or documentation change, simply bump the `knowledge_version` (e.g., from `"v12"` to `"v13"`). MemoLM's Safety Gate will **instantly invalidate all outdated cached responses without deleting any database records**:

```python
# Request with updated knowledge version
response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "What is the return policy?"}],
    knowledge_version="v13",  # Stale v12 cache entries are automatically rejected!
)
```

---

## ⚙️ Configuration & Options

### `MemoLM` / `AsyncMemoLM` Config

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `base_url` | `str` | `"http://localhost:8000"` | Gateway base URL. |
| `api_key` | `str` | `"memo-key"` | Gateway authentication or provider API key. |
| `default_tenant` | `str` | `"default-tenant"` | Default multi-tenant isolation namespace. |
| `default_knowledge_version` | `str` | `"v1"` | Default knowledge version for Safety Gate. |
| `default_risk` | `str` | `"low"` | Default risk policy threshold (`"low"`, `"medium"`, `"high"`). |
| `timeout` | `float` | `60.0` | Request timeout in seconds. |
| `default_headers` | `dict` | `{}` | Custom headers sent on every request. |

### `client.chat.completions.create(...)`

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `model` | `str` | Target model name (e.g. `gpt-4o`, `openai/gpt-oss-20b`, `llama-3.3-70b-versatile`). |
| `messages` | `list` | List of chat message dicts or `Message` models (`role` and `content`). |
| `knowledge_version` | `str` | Version tag for the Safety Gate (e.g. `"v12"`). |
| `tenant_id` | `str` | Tenant namespace for strict data boundary isolation. |
| `risk` | `str` | Risk policy governing similarity threshold (`"low"`, `"medium"`, `"high"`). |
| `ttl_seconds` | `int` | Custom TTL in seconds. |
| `stream` | `bool` | If `True`, returns a generator of SSE `ChatCompletionChunk` items. |
| `temperature` | `float` | Sampling temperature. |
| `max_tokens` | `int` | Maximum tokens to generate. |
| `extra_headers` | `dict` | Extra request headers. |

---

## 🧪 Running Tests

```bash
pytest sdk/python/tests
```

---

## 📄 License

MIT
