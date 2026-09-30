# 2. MemoLM Core Engine & Gateway ⚙️🛡️

**Owner:** Backend / Core Engine Developer  
**Tech Stack:** Python 3.11+, FastAPI, Redis (Exact Match & Metrics), Qdrant / FastEmbed (Semantic Vectors), Pydantic v2

---

## 🎯 Goal & Responsibilities
Build the high-performance async reverse proxy, the Exact Hash Cache, the Vector Semantic Retrieval pipeline, the **Safety Gate Engine**, and the Upstream Provider Adapters.

---

## 📋 Detailed Responsibilities

### 1. Gateway API (`POST /v1/chat/completions`)
* Full wire-compatibility with OpenAI Chat Completions payload schema.
* Parses standard bodies (`model`, `messages`, `temperature`) + custom MemoLM headers:
  * `x-memolm-tenant`
  * `x-memolm-knowledge-version`
  * `x-memolm-prompt-version`
  * `x-memolm-risk`
  * `x-memolm-ttl`

### 2. Exact Hash Cache (Redis)
* Deterministic key computation:
  `memolm:exact:{tenant}:{provider}:{model}:{prompt_ver}:{knowledge_ver}:{sha256(messages)}`
* `O(1)` fetch; returns in single-digit milliseconds.

### 3. Vector Semantic Search (Qdrant)
* Embed user query (via OpenAI `text-embedding-3-small` or local `FastEmbed`).
* Cosine search against collection `memolm_semantic_entries`.
* Filter candidates by matching `tenant_id`, `provider`, and `model`.

### 4. The Safety Gate Engine (`safety.py`)
For every semantic candidate, execute the 5-point verification pipeline:
1. **Tenant Isolation:** `cached.tenant_id == request.tenant_id`
2. **Model/Provider Match:** `cached.model == request.model`
3. **Knowledge Version Match:** `cached.knowledge_version == request.knowledge_version`
4. **TTL Validity:** `now < cached.created_at + cached.ttl_seconds`
5. **Risk Policy:** Ensure similarity $\ge$ risk threshold (e.g. `low: 0.90`, `medium: 0.94`, `high: 0.98` / disabled).
* Returns `{ verdict: "SAFE" | "REJECTED", reasons: [...], similarity: float }`.

### 5. Upstream Provider Adapters (`providers.py`)
* **OpenAI Adapter:** Calls standard OpenAI API on cache miss/rejection.
* **Gemini Adapter:** Calls Google Generative AI (Gemini 1.5 Flash / Pro) and normalizes output into OpenAI chat completion shape.
* **Write-back:** Asynchronously write fresh successful responses to Redis & Qdrant.

### 6. Metrics & Analytics (`/api/metrics`)
* Atomic Redis counters for hits, misses, avoidances, tokens, and rejection buckets.
