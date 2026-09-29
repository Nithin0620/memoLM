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

### 1. Drop-in OpenAI Wrapper (`wrap_openai`)
If your project already uses `openai.OpenAI` or `openai.AsyncOpenAI`, adopt MemoLM in **1 line of code** without modifying existing call sites:

```python
from openai import OpenAI
from memolm import wrap_openai

# Wrap your existing OpenAI client instance
client = wrap_openai(
    OpenAI(),
    gateway_url="http://localhost:8000",
    knowledge_version="v12",
    tenant_id="acme-corp",
    risk="low",
    fallback_to_upstream=True  # Fails open directly to OpenAI if gateway is down
)

# Standard call sites remain completely untouched
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is the return policy?"}],
)

print(response.choices[0].message.content)

# Access MemoLM explainability stats
if hasattr(response, "memolm_stats") and response.memolm_stats:
    print(f"Verdict: {response.memolm_stats.verdict}")
    print(f"Similarity: {response.memolm_stats.similarity}")
    print(f"Latency Saved: {response.memolm_stats.latency_saved}s")

# Check session ROI metrics
print(client.get_session_metrics())
```

---

### 2. Native Typed Client (`MemoLM` / `AsyncMemoLM`)

```python
from memolm import MemoLM

client = MemoLM(
    base_url="http://localhost:8000",
    default_knowledge_version="v12",
    default_tenant="acme-corp",
    default_risk="low",
    max_retries=2,
    fallback_to_upstream=True,
)

response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "How do refunds work?"}],
    knowledge_version="v12",
    force_refresh=False,       # Set True to bypass cache & force LLM call
    similarity_threshold=0.95, # Custom cosine threshold override
)

print(response.content)
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

## ⚡ Telemetry & Observability Callbacks

Integrate easily with Datadog, OpenTelemetry, Langfuse, or custom logging:

```python
client = MemoLM(
    base_url="http://localhost:8000",
    on_cache_hit=lambda stats: print(f"⚡ Cache hit: {stats.similarity}, saved {stats.latency_saved}s"),
    on_cache_miss=lambda stats: print("❌ Cache miss -> routed to LLM"),
    on_safety_reject=lambda reasons: print(f"🛡️ Safety rejected: {reasons}"),
)

# Read aggregate session statistics anytime:
print(client.get_session_metrics())
# Output:
# {
#   'total_requests': 25,
#   'cache_hits': 18,
#   'cache_misses': 7,
#   'safety_rejections': 0,
#   'total_latency_saved_sec': 21.6,
#   'estimated_cost_saved_usd': 0.054,
#   'hit_rate_pct': 72.0
# }
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
| `max_retries` | `int` | `2` | Number of automatic retries on transient errors (429, 500, 503). |
| `fallback_to_upstream` | `bool` | `False` | Fail-open: calls LLM directly if gateway is offline. |
| `on_cache_hit` | `callable` | `None` | Callback invoked on safe cache hits. |
| `on_cache_miss` | `callable` | `None` | Callback invoked on cache misses. |
| `on_safety_reject` | `callable` | `None` | Callback invoked on Safety Gate rejections. |

### `client.chat.completions.create(...)`

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `model` | `str` | Target model name (e.g. `gpt-4o`, `openai/gpt-oss-20b`, `llama-3.3-70b-versatile`). |
| `messages` | `list` | List of chat message dicts or `Message` models (`role` and `content`). |
| `knowledge_version` | `str` | Version tag for the Safety Gate (e.g. `"v12"`). |
| `tenant_id` | `str` | Tenant namespace for strict data boundary isolation. |
| `risk` | `str` | Risk policy governing similarity threshold (`"low"`, `"medium"`, `"high"`). |
| `force_refresh` | `bool` | If `True`, bypasses reading from cache, queries LLM fresh, and updates cache. |
| `cache_only` | `bool` | If `True`, only returns if cached; does not call LLM on miss. |
| `similarity_threshold` | `float` | Custom cosine similarity threshold override (e.g. `0.95`). |
| `stream` | `bool` | If `True`, returns a generator of SSE `ChatCompletionChunk` items. |

---

## 🧪 Running Tests

```bash
pytest sdk/python/tests
```

---

## 📄 License

MIT
