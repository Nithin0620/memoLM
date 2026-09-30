# MemoLM ⚡🛡️

> **Intelligent LLM Response Firewall & Safe Semantic Cache Gateway**
> 
> *Drop-in OpenAI-compatible proxy that prevents unnecessary LLM calls by serving cached answers only when they are semantically relevant and verified safe to reuse.*

---

## 💡 What is MemoLM?

Most semantic caches make a dangerous assumption: **if similarity is high, the answer is safe to reuse.**

In reality:
* Documentation or business policies update (`v12` ➔ `v13`).
* Time-sensitive answers expire (TTL).
* High-risk domains require strict routing to fresh models.
* Multi-tenant data must never cross boundaries.

**MemoLM** intercepts requests between your application and providers (OpenAI, Gemini), running every semantic match through an explainable **Safety Gate** before serving.

---

## 🏗️ Architecture

```
Application (OpenAI / Gemini SDK or MemoLM SDK)
                     │
                     ▼
             MemoLM Gateway (POST /v1/chat/completions)
                     |
                     │ 
         ┌───────────▼───────────┐
         │    Semantic Search    │
         │   (Qdrant / Vector)   │
         └───────────┬───────────┘
                     │ [ CANDIDATE FOUND ]
         ┌───────────▼───────────┐
         │      SAFETY GATE      │
         │  - Knowledge Version  │
         │  - TTL Validity       │
         │  - Risk Policy        │
         │  - Tenant Isolation   │
         └───────────┬───────────┘
                     │
            ┌────────┴────────┐
            ▼                 ▼
      [ ✅ SAFE HIT ]   [ ❌ REJECT / MISS ]
            │                 │
      Return Cached     Forward to Provider
      Response (~20ms)  (OpenAI or Gemini)
                              │
                        Write-back & Return
```

---

## 🚀 Quickstart

### 1. Drop-in OpenAI Proxy (Zero Code Changes)
```python
from openai import OpenAI

# Point standard OpenAI client to MemoLM Gateway
client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is the return policy?"}],
    extra_headers={
        "x-memolm-knowledge-version": "v12",
        "x-memolm-risk": "low"
    }
)
```

### 2. Using the MemoLM Python SDK
```python
from memolm import MemoLM

client = MemoLM(base_url="http://localhost:8000/v1")

response = client.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Can I get my money back?"}],
    knowledge_version="v12",
    risk="low"
)

print(response.memolm_verdict)
# Output: { 'verdict': 'SAFE_CACHE_HIT', 'similarity': 0.942, 'latency_saved': '1.18s' }
```

---

> 📖 **Full SDK Documentation & Guide:** See [SDK_GUIDE.md](SDK_GUIDE.md) for complete Python and TypeScript SDK setup, streaming, fail-open resilience, active cache controls, and cookbooks.

---


## 🛡️ The Safety Gate

Every candidate match is evaluated against explicit constraints:

| Safety Check | Rule / Condition | On Failure |
| :--- | :--- | :--- |
| **Knowledge Version** | `cached.knowledge_version == current` | ❌ Rejects stale doc answers ➔ Routes to LLM |
| **TTL** | `now < cached.created_at + ttl` | ❌ Expired entry ➔ Routes to LLM |
| **Domain Risk** | Policy threshold check (e.g. FAQ: 0.85, Financial: 0.96) | ❌ Below safety margin ➔ Routes to LLM |
| **Tenant / Model** | Isolated namespaces per tenant & model | ❌ Strictly namespaced |

---

## 📊 Observability & Interactive Playground

MemoLM includes a real-time dashboard and playground to:
* Track **Cost Saved ($)** and **Latency Saved (seconds)**.
* Inspect **Cache Explainability** traces (rejection reasons & similarity scores).
* Live-test knowledge version invalidation in the playground.

---

## 📄 License
MIT License.
