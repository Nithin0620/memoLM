# MemoLM Backend (Core Engine & Gateway)

FastAPI asynchronous gateway with Qdrant vector semantic caching, Bring-Your-Own-Key (BYOK) multi-provider upstream routing, and multi-layer Safety Gate enforcement.

---

## Architecture Overview

The backend acts as a drop-in proxy intercepting OpenAI-compatible chat completion requests.

```text
Client (SDK / curl / OpenAI client with their own API key)
  │
  ▼
FastAPI Gateway (`main.py`)
  ├── Extracts Client API Key (`Authorization: Bearer <key>` or `x-memolm-api-key`)
  ├── Provider Resolution (`provider/`) -> groq | openai | anthropic | gemini
  ├── Personal-Data Guard (`dynamic_ttl.contains_personal_data`)
  ├── Context-Aware Embedding (`embedding/context_chain.py`)
  │
  ▼
Qdrant Semantic Cache (`database/qdrant_store.py`)
  │
  ├── [Cache Hit & Safety Gate Pass] ───────────────► Return cached response (~20ms)
  │                                                   (Client API key is never sent upstream!)
  │
  └── [Cache Miss / Safety Gate Reject] ────────────► Upstream Provider (LLM)
                                                        │  (Uses developer's API key)
                                                        ├── Write-back to Qdrant (if TTL > 0)
                                                        └── Stream/Return to client
```

---

## Key Features & Capabilities

### 1. Bring-Your-Own-Key (BYOK) & Multi-Provider Router
- **Developer-Supplied Keys:** Developers supply their own provider API keys via standard `Authorization: Bearer <key>`, `x-memolm-api-key`, or request JSON body `api_key`.
- **Zero Provider Config Required on Server:** The gateway operator only needs to configure the Qdrant vector database (`QDRANT_URL` and `QDRANT_API_KEY`). Upstream LLM calls are funded by the developer's keys.
- **Provider Switching:** Handled dynamically via `x-memolm-provider` or JSON body `provider`.
- Supported providers:
  - **Groq** (`langchain-groq`): Default model `openai/gpt-oss-20b`.
  - **OpenAI** (`langchain-openai`): Default model `gpt-4o-mini`. Supports custom base URLs (vLLM, Ollama, OpenRouter).
  - **Anthropic** (`langchain-anthropic`): Default model `claude-sonnet-4-5`.
  - **Gemini** (`langchain-google-genai`): Default model `gemini-2.5-flash`.

### 2. Gateway Endpoints & Controls (`main.py`)
- **Endpoints:**
  - `POST /v1/chat/completions`, `POST /openai/v1/chat/completions`, `POST /chat/completions`
  - `POST /cache/invalidate`: Invalidate entries by tenant.
  - `POST /cache/inspect`: Dry-run query inspection against the cache without calling LLMs.
  - `POST /cache/seed`: Bulk pre-warm FAQ / documentation items into Qdrant.
- **Request Headers:**
  - `Authorization`: `Bearer <provider_api_key>`
  - `x-memolm-provider`: Select upstream provider (`groq`, `openai`, `anthropic`, `gemini`).
  - `x-memolm-tenant`: Cache namespace per developer/application (default: `default-tenant`).
  - `x-memolm-risk`: Risk level (`low`, `medium`, `high`).
  - `x-memolm-force-refresh`: Bypasses cache read while still writing fresh results.
  - `x-memolm-cache-only`: Enforces cache hit only; returns 404 on a miss without calling upstream LLMs.
  - `x-memolm-similarity-threshold`: Explicitly overrides similarity bar for the request.

### 3. Context-Aware Embedding (`embedding/`)
- **Model:** Local execution of `BAAI/bge-base-en-v1.5` via `fastembed` (768-dimensional dense vectors). Runs fully offline with ONNX runtime.
- **Weighted Vector Fusion (`context_chain.py`):**
  - Filters and retains only `user` role queries (ignores lengthy assistant responses to avoid vector dilution).
  - Merges recent user context with current question:
    $$\vec{v}_{\text{fused}} = 0.80 \cdot \text{embed}(\text{current\_query}) + 0.20 \cdot \text{embed}(\text{recent\_user\_context})$$
  - Normalizes with L2 unit norm to guarantee stable cosine distances.

### 4. Dynamic Semantic TTL & Privacy Guard (`dynamic_ttl.py`)
- **Semantic Routing:** Matches queries against 8 anchor phrases per time-to-live bucket.
  - Buckets range from real-time / breaking news (`180s`), hourly (`3600s`), daily (`86400s`), to evergreen facts (`2592000s` / 30 days).
  - Default fallback for ambiguous queries is 24 hours (`86400s`).
- **Personal-Data Guard:** Hard pattern-matching for sensitive data (orders, invoice IDs, phone numbers, emails, possessive credentials). Routes immediately to `TTL=0` (bypasses cache read/write completely).

### 5. Database Store & Safety Gate (`database/qdrant_store.py`)
- **Storage:** Single-store architecture using Qdrant vector database (`COLLECTION_NAME = "memolm_cache"`).
- **Safety Gate Verification:**
  - **TTL Expiry:** Entry must not be past `expiry`.
  - **Risk-Adjusted Similarity Floors:**
    - `low` risk: Cosine score $\ge 0.92$
    - `medium` risk: Cosine score $\ge 0.95$
    - `high` risk: Cosine score $\ge 0.98$ (forces fresh generation)
  - **Tenant Isolation:** Matches `tenant_id` payload indexes.

---

## Server Deployment Configuration (Render, Docker, VPS)

Because client API keys are provided dynamically, server configuration only requires the vector database credentials:

```env
# Vector Database
QDRANT_URL=https://your-cluster-id.us-east4-0.gcp.cloud.qdrant.io:6333
QDRANT_API_KEY=your_qdrant_api_key

# Default fallback provider if client omits x-memolm-provider
MEMOLM_DEFAULT_PROVIDER=groq
PYTHONPATH=.
```

---

## How Developers Call Your Gateway

Developers simply point their standard OpenAI client to your gateway and pass their own API key:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-memolm-gateway.onrender.com/v1",
    api_key="gsk_your_groq_or_openai_api_key"
)

response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "What is the return policy?"}],
    extra_headers={
        "x-memolm-provider": "groq",
        "x-memolm-tenant": "my-app"
    }
)

print(response.choices[0].message.content)
```
