# MemoLM SDK Developer Guide & Integration Manual ⚡🛡️

> **Complete guide to integrating MemoLM into your Python and TypeScript / JavaScript applications.**
>
> MemoLM acts as an intelligent LLM response firewall and semantic cache gateway. The SDKs provide type-safe clients, drop-in OpenAI wrappers, explainability inspection, active cache management, and session-level ROI tracking.

---

## 📑 Table of Contents

1. [Overview & Architecture](#-overview--architecture)
2. [SDK Packages](#-sdk-packages)
3. [Python SDK Guide (`memolm`)](#-python-sdk-guide-memolm)
   - [Installation & Local Setup](#installation--local-setup)
   - [Drop-in OpenAI Wrapper (`wrap_openai`)](#1-drop-in-openai-wrapper-wrap_openai)
   - [Native Client (`MemoLM`)](#2-native-sync-client-memolm)
   - [Asynchronous Client (`AsyncMemoLM`)](#3-asynchronous-client-asyncmemolm)
   - [Streaming Completions (SSE)](#4-streaming-completions-sse)
4. [TypeScript / JavaScript SDK Guide (`@memolm/sdk`)](#-typescript--javascript-sdk-guide-memolmsdk)
   - [Installation & Build](#installation--build)
   - [Native Client (`MemoLM`)](#1-native-client-memolm)
   - [Streaming Completions (SSE)](#2-real-time-streaming-sse)
   - [Drop-in OpenAI Wrapper (`wrapOpenAI`)](#3-drop-in-openai-wrapper-wrapopenai)
5. [Core Features & The Safety Gate](#-core-features--the-safety-gate)
   - [Safety Gate Parameters](#1-safety-gate-parameters)
   - [Per-Request Cache Controls](#2-per-request-cache-controls)
   - [Active Cache Management (`cache.inspect`, `cache.seed`, `cache.invalidate`)](#3-active-cache-management)
   - [Session ROI & Telemetry Tracking](#4-session-roi--telemetry-tracking)
   - [Resilience & Fail-Open Behavior](#5-resilience--fail-open-behavior)
6. [API Reference](#-api-reference)
   - [Client Configuration](#client-configuration)
   - [Chat Completion Request Options](#chat-completion-request-options)
   - [Cache Response Shapes (`memolm_stats`)](#cache-response-shapes-memolm_stats)
   - [Exception Handling](#exception-handling)
7. [Cookbook & Practical Recipes](#-cookbook--practical-recipes)
   - [Recipe 1: Safe Knowledge Version Rollout (`v12` ➔ `v13`)](#recipe-1-safe-knowledge-version-rollout-v12--v13)
   - [Recipe 2: Pre-seeding FAQ Answers for Zero-Latency Cold Hits](#recipe-2-pre-seeding-faq-answers-for-zero-latency-cold-hits)
   - [Recipe 3: Dry-run Query Inspection Before Billing an LLM](#recipe-3-dry-run-query-inspection-before-billing-an-llm)
8. [Testing & Local Development](#-testing--local-development)

---

## 💡 Overview & Architecture

MemoLM intercepts requests between your application and LLM providers (Groq, OpenAI, Gemini). Rather than blindly returning any high-similarity cache hit, MemoLM subjects every candidate response to a multi-point **Safety Gate**:

```
Application (Python / TypeScript SDK)
                │
                ▼
        MemoLM Gateway (:8000)
                │
    ┌───────────▼───────────┐
    │  Semantic & Exact     │
    │  Retrieval (Qdrant)   │
    └───────────┬───────────┘
                │ [ Candidate Found ]
    ┌───────────▼───────────┐
    │      SAFETY GATE      │
    │  - Knowledge Version  │  ──[ MISMATCH ]──► Forward fresh to LLM
    │  - TTL Freshness      │  ──[ EXPIRED ]───► Forward fresh to LLM
    │  - Risk Margin        │  ──[ VIOLATION ]─► Forward fresh to LLM
    │  - Tenant Isolation   │  ──[ MISMATCH ]──► Forward fresh to LLM
    └───────────┬───────────┘
                │ [ ALL PASSED ]
                ▼
        ✅ SAFE_CACHE_HIT (~20ms, $0)
```

---

## 📦 SDK Packages

| Package | Language / Runtimes | Directory Path | Key Exports |
| :--- | :--- | :--- | :--- |
| **`memolm`** | Python 3.9+ | [`sdk/python`](file:///C:/Users/anura/Desktop/memoLM/sdk/python) | `MemoLM`, `AsyncMemoLM`, `wrap_openai`, `QAPair`, `SessionMetrics` |
| **`@memolm/sdk`** | TypeScript, Node.js, Bun, Next.js, Edge | [`sdk/typescript`](file:///C:/Users/anura/Desktop/memoLM/sdk/typescript) | `MemoLM`, `wrapOpenAI`, `Cache`, `createSSEStream` |

---

## 🐍 Python SDK Guide (`memolm`)

### Installation & Local Setup

```bash
# For local development within this repository:
pip install -e sdk/python

# Or install dependencies directly:
pip install httpx pydantic
```

---

### 1. Drop-in OpenAI Wrapper (`wrap_openai`)

If your application already uses `openai.OpenAI`, you can adopt MemoLM in **1 line of code** with zero changes to existing prompts or call sites:

```python
from openai import OpenAI
from memolm import wrap_openai

# Initialize your regular OpenAI client and wrap it
openai_client = OpenAI(api_key="your-openai-key")
client = wrap_openai(
    openai_client,
    gateway_url="http://localhost:8000",
    knowledge_version="v12",
    tenant_id="acme-corp",
    risk="low",
    fallback_to_upstream=True  # Automatically fails open to OpenAI if MemoLM is down
)

# Standard call sites continue working as usual
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is the return policy?"}],
)

print(response.choices[0].message.content)

# Access explainability statistics
if response.memolm_stats:
    print(f"Verdict: {response.memolm_stats.verdict}")
    print(f"Similarity: {response.memolm_stats.similarity}")
    print(f"Latency Saved: {response.memolm_stats.latency_saved}s")

# Print session ROI metrics
print(client.get_session_metrics())
```

---

### 2. Native Sync Client (`MemoLM`)

```python
from memolm import MemoLM

client = MemoLM(
    base_url="http://localhost:8000",
    api_key="memo-key",
    default_tenant="acme-corp",
    default_knowledge_version="v12",
    default_risk="low",
    max_retries=2,
    fallback_to_upstream=True,
)

response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[
        {"role": "system", "content": "You are a customer support agent."},
        {"role": "user", "content": "How long do refunds take?"}
    ],
    knowledge_version="v12",
    tenant_id="acme-corp",
    risk="low",
    force_refresh=False,       # Set True to bypass cache
    similarity_threshold=0.88, # Optional custom similarity threshold
)

print(response.content)
print(f"Cache verdict: {response.memolm_stats.verdict}")
```

---

### 3. Asynchronous Client (`AsyncMemoLM`)

Supports native `async` / `await` and async context management:

```python
import asyncio
from memolm import AsyncMemoLM

async def main():
    async with AsyncMemoLM(base_url="http://localhost:8000") as client:
        response = await client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": "Where is my order?"}],
            knowledge_version="v12",
            tenant_id="acme-corp",
        )
        print(response.content)
        print(client.get_session_metrics())

asyncio.run(main())
```

---

### 4. Streaming Completions (SSE)

Supports token-by-token Server-Sent Events with transparent cached or fresh LLM chunks:

```python
from memolm import MemoLM

client = MemoLM(base_url="http://localhost:8000")

stream = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "Explain how Dijkstra's algorithm works."}],
    knowledge_version="v12",
    stream=True,
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()
```

---

## 🔷 TypeScript / JavaScript SDK Guide (`@memolm/sdk`)

### Installation & Build

```bash
# Within this repository:
cd sdk/typescript
npm install
npm run build

# In your Node / Frontend / Next.js project:
npm install ./sdk/typescript
# or
npm install @memolm/sdk
```

---

### 1. Native Client (`MemoLM`)

```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({
  baseURL: "http://localhost:8000",
  apiKey: "memo-key",
  defaultKnowledgeVersion: "v12",
  defaultTenant: "acme-corp",
  defaultRisk: "low",
  maxRetries: 2,
  fallbackToUpstream: true,
});

async function run() {
  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "system", content: "You are a customer support agent." },
      { role: "user", content: "What is your refund policy?" }
    ],
    knowledgeVersion: "v12",
    tenantId: "acme-corp",
  });

  console.log("Answer:", response.choices[0].message.content);
  console.log("Stats:", response.memolm_stats);
  console.log("Session Metrics:", client.getSessionMetrics());
}

run();
```

---

### 2. Real-Time Streaming (SSE)

Compatible with async iterables in Node.js, Next.js Server Actions, and Edge runtimes:

```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({ baseURL: "http://localhost:8000" });

async function streamDemo() {
  const stream = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [{ role: "user", content: "Write a short poem about caching." }],
    knowledgeVersion: "v12",
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(text);
  }
  console.log();
}

streamDemo();
```

---

### 3. Drop-in OpenAI Wrapper (`wrapOpenAI`)

```typescript
import OpenAI from "openai";
import { wrapOpenAI } from "@memolm/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const wrapped = wrapOpenAI(openai, {
  gatewayURL: "http://localhost:8000",
  defaultKnowledgeVersion: "v12",
  defaultTenant: "acme-corp",
  fallbackToUpstream: true, // Fails open to OpenAI if gateway is unreachable
});

const res = await wrapped.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "How do I reset my password?" }],
});

console.log(res.choices[0].message.content);
console.log(wrapped.getSessionMetrics());
```

---

## 🛡️ Core Features & The Safety Gate

### 1. Safety Gate Parameters

Every query sent through MemoLM includes safety controls:

| Parameter | Header Sent | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `knowledge_version` / `knowledgeVersion` | `x-memolm-version` | `"v1"` | Prevents stale answers. If knowledge bumped (`v12` ➔ `v13`), stale cache entries are rejected. |
| `tenant_id` / `tenantId` | `x-memolm-tenant` | `"default-tenant"` | Enforces strict multi-tenant isolation in the vector store. |
| `risk` | `x-memolm-risk` | `"low"` | Controls risk margin (`low`, `medium`, `high`). High risk requires tighter similarity or skips cache. |
| `ttl_seconds` / `ttlSeconds` | `x-memolm-ttl` | Auto-calculated | Custom expiration window override. |

---

### 2. Per-Request Cache Controls

Override cache behavior dynamically per call:

- **`force_refresh` / `forceRefresh` (`bool`)**: Bypasses cache lookup, calls the upstream LLM fresh, and updates the cache with the new answer.
- **`cache_only` / `cacheOnly` (`bool`)**: Only queries the cache. If no safe hit is found, raises `CacheMissError` (HTTP 404) without calling or billing the LLM.
- **`similarity_threshold` / `similarityThreshold` (`float`)**: Overrides default similarity threshold for this specific request (e.g. `0.95`).

```python
# Cache-only check (guaranteed $0 LLM cost)
try:
    response = client.chat.completions.create(
        messages=[{"role": "user", "content": "How do I get a refund?"}],
        cache_only=True,
    )
    print("Found in cache:", response.content)
except CacheMissError:
    print("Not in cache — decided not to call upstream LLM.")
```

---

### 3. Active Cache Management

Both SDKs expose the `client.cache` sub-client for administrative operations:

#### A. Inspect (`client.cache.inspect`)
Dry-run test what candidate matches in Qdrant and whether the Safety Gate would pass or reject:

```python
inspection = client.cache.inspect(
    query="Can I return opened merchandise?",
    tenant_id="acme-corp",
    version="v12",
    risk="low"
)

print(inspection["verdict"])           # "SAFE_CACHE_HIT" or "SAFETY_REJECTED" or "CACHE_MISS"
print(inspection["similarity"])        # 0.942
print(inspection["rejection_reasons"]) # [] or ['knowledge_version_mismatch', ...]
```

#### B. Seed (`client.cache.seed`)
Bulk warm-up known documentation or FAQ entries directly into the vector store:

```python
from memolm import QAPair

client.cache.seed([
    QAPair(
        question="What is the refund window?",
        answer="All items can be refunded within 30 days of purchase.",
        tenant_id="acme-corp",
        version="v12",
        risk="low"
    ),
    QAPair(
        question="Where are you located?",
        answer="Our headquarters are in San Francisco, California.",
        tenant_id="acme-corp",
        version="v12"
    )
])
```

#### C. Invalidate (`client.cache.invalidate`)
Explicitly purge cached vectors by knowledge version or tenant:

```python
client.cache.invalidate(tenant_id="acme-corp", version="v11")
```

---

### 4. Session ROI & Telemetry Tracking

Both SDKs maintain in-memory counters tracking business savings across the client's lifecycle:

```python
metrics = client.get_session_metrics()
print(metrics)
# Output: Total requests: 10 | Hits: 8 (80.0%) | Latency Saved: 9.4s | Cost Saved: $0.04
```

In TypeScript:
```typescript
const metrics = client.getSessionMetrics();
console.log(metrics.hitRatePct);             // 80.0
console.log(metrics.totalLatencySavedSec);   // 9.44
console.log(metrics.estimatedCostSavedUsd);  // 0.04
```

You can also attach event callbacks:
```python
client = MemoLM(
    on_cache_hit=lambda stats: print(f"⚡ Hit! Saved {stats.latency_saved}s"),
    on_cache_miss=lambda stats: print("❌ Cache miss; called LLM"),
    on_safety_reject=lambda reasons: print(f"🛡️ Safety rejected: {reasons}"),
)
```

---

### 5. Resilience & Fail-Open Behavior

MemoLM is built for zero production disruption:
1. **Exponential Jittered Retries**: Automatically retries transient network errors (HTTP 429, 500, 502, 503) up to `max_retries` with jitter. Respects `Retry-After` response headers.
2. **Fail-Open Fallback**: When `fallback_to_upstream=True` (or with `wrap_openai`), if the MemoLM gateway is unreachable, the SDK logs a warning and transparently forwards the call directly to OpenAI / Groq so your application never crashes.

---

## 📖 API Reference

### Client Configuration

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `base_url` / `baseURL` | `str` | `"http://localhost:8000"` | MemoLM gateway base endpoint |
| `api_key` / `apiKey` | `str` | `"memo-key"` | Gateway authentication key |
| `default_tenant` / `defaultTenant` | `str` | `"default-tenant"` | Default tenant namespace |
| `default_knowledge_version` / `defaultKnowledgeVersion` | `str` | `"v1"` | Default knowledge version |
| `default_risk` / `defaultRisk` | `str` | `"low"` | Default risk policy (`"low"`, `"medium"`, `"high"`) |
| `timeout` | `float` | `60.0` | HTTP request timeout in seconds |
| `max_retries` / `maxRetries` | `int` | `2` | Number of retry attempts on retryable network errors |
| `fallback_to_upstream` / `fallbackToUpstream` | `bool` | `False` | Fail open directly to LLM provider if gateway is offline |
| `upstream_provider` | `str` | `"groq"` | Upstream provider for fail-open (`"groq"` or `"openai"`) |
| `upstream_api_key` | `str` | `None` | API key for upstream fallback (defaults to env var) |

---

### Chat Completion Request Options

Passed into `client.chat.completions.create(...)`:

- `messages`: List of `{"role": "user"|"assistant"|"system", "content": "..."}` or `Message` objects.
- `model`: Target LLM model (e.g. `"openai/gpt-oss-20b"`, `"gpt-4o"`).
- `knowledge_version`: Version string for Safety Gate matching (e.g. `"v12"`).
- `tenant_id`: Tenant namespace tag.
- `risk`: `"low"`, `"medium"`, or `"high"`.
- `ttl_seconds`: Custom TTL in seconds.
- `force_refresh`: Boolean to force a fresh LLM call.
- `cache_only`: Boolean to only accept cache hits; errors on miss.
- `similarity_threshold`: Float (0.0 to 1.0) cosine cutoff override.
- `stream`: Boolean (returns iterator or async generator when `True`).

---

### Cache Response Shapes (`memolm_stats`)

When a completion returns, `response.memolm_stats` contains:

```json
{
  "verdict": "SAFE_CACHE_HIT",
  "similarity": 0.965,
  "latency_saved": 1.18,
  "latency_saved_ms": 1180.0,
  "cost_saved": 0.005,
  "rejection_reasons": [],
  "payload": {
    "response": "...",
    "tenant_id": "acme-corp",
    "knowledge_version": "v12"
  }
}
```

Possible `verdict` values:
- `SAFE_CACHE_HIT`: Verified safe match served from cache.
- `CACHE_MISS`: No candidate found in vector store; forwarded to LLM.
- `SAFETY_REJECTED`: Candidate found, but blocked by Safety Gate (stale version, expired TTL, or risk); forwarded to LLM fresh.

---

### Exception Handling

| Exception | HTTP Code | Scenario |
| :--- | :---: | :--- |
| `GatewayUnavailableError` | — | MemoLM server cannot be reached / connection refused |
| `CacheMissError` | 404 | Raised when `cache_only=True` and no safe cache hit was found |
| `SafetyGateRejectionError` | 400 | Rejection details when strict safety gate enforcement fails |
| `UpstreamProviderError` | 502 | Upstream LLM provider returned an error |
| `MemoLMError` | 4xx / 5xx | Base exception class for all MemoLM SDK errors |

---

## 🍳 Cookbook & Practical Recipes

### Recipe 1: Safe Knowledge Version Rollout (`v12` ➔ `v13`)

When docs or pricing change, simply increment `knowledge_version`. Outdated answers are instantly blocked:

```python
# Old documentation version:
res1 = client.chat.completions.create(
    messages=[{"role": "user", "content": "What is the premium plan price?"}],
    knowledge_version="v12"
)
# Result: Cached answer "$10/mo" served from cache

# Policy updates: Pricing is now $15/mo. Bump to v13:
res2 = client.chat.completions.create(
    messages=[{"role": "user", "content": "What is the premium plan price?"}],
    knowledge_version="v13" # Safety Gate blocks stale v12 and calls LLM fresh
)
# Result: LLM called fresh -> "$15/mo" cached under v13
```

---

### Recipe 2: Pre-seeding FAQ Answers for Zero-Latency Cold Hits

Warm up your cache from existing help desk articles before users ever submit a query:

```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({ baseURL: "http://localhost:8000" });

await client.cache.seed([
  {
    question: "How do I cancel my subscription?",
    answer: "Go to Settings > Billing and click Cancel Subscription.",
    tenantId: "saas-app",
    version: "v1",
    risk: "low"
  }
]);

// Any similar question now gets an instant ~20ms hit on turn 1!
const answer = await client.chat.completions.create({
  messages: [{ role: "user", content: "I want to cancel my account plan" }],
  tenantId: "saas-app",
  knowledgeVersion: "v1"
});
```

---

### Recipe 3: Dry-run Query Inspection Before Billing an LLM

```python
inspection = client.cache.inspect("How do I export my invoice?")
if inspection["verdict"] == "SAFE_CACHE_HIT":
    print("Will be served free from cache with score:", inspection["similarity"])
else:
    print("Will require LLM call because:", inspection["rejection_reasons"])
```

---

## 🧪 Testing & Local Development

### Running Python Tests
```bash
# From workspace root:
.\venv\Scripts\python.exe -m pytest sdk/python/tests
```
Expected output: **36 passed**

### Running TypeScript Tests & Build
```bash
cd sdk/typescript

# Run test suite:
npm run test

# Run TypeScript typecheck:
npm run typecheck

# Build ESM, CommonJS, and DTS distribution:
npm run build
```
Expected output: **40 passed**, clean typecheck and build.
