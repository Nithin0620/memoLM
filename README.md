# MemoLM ⚡🛡️

> **Intelligent LLM Response Firewall & Safe Semantic Cache Gateway**
> 
> *Drop-in OpenAI & Groq compatible proxy with native Python and TypeScript SDKs. Prevents unnecessary LLM calls by serving cached answers only when they are semantically relevant and verified safe to reuse.*

[![npm version](https://img.shields.io/npm/v/@memolm/sdk.svg?style=flat-square&color=6366f1)](https://www.npmjs.com/package/@memolm/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@memolm/sdk.svg?style=flat-square)](https://www.npmjs.com/package/@memolm/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 📦 SDK Installation

### TypeScript / JavaScript SDK
```bash
npm install @memolm/sdk
# or
pnpm add @memolm/sdk
# or
yarn add @memolm/sdk
# or
bun add @memolm/sdk
```

### Python SDK
```bash
pip install memolm
# or install from source
pip install -e sdk/python
```

---

## 💡 What is MemoLM?

Most semantic caches make a dangerous assumption: **if similarity is high, the answer is safe to reuse.**

In reality:
* Documentation or business policies update (`v12` ➔ `v13`).
* Time-sensitive answers expire (TTL).
* High-risk domains require strict routing to fresh models.
* Multi-tenant data must never cross boundaries.

**MemoLM** intercepts requests between your application and providers (Groq, OpenAI), running every semantic match through an explainable **Safety Gate** before serving.

---

## 🏗️ Architecture

```
Application (TypeScript @memolm/sdk, Python memolm, or OpenAI SDK)
                                 │
                                 ▼
              MemoLM Gateway (POST /v1/chat/completions)
                                 │
                     ┌───────────▼───────────┐
                     │      Exact Cache      │ ──[ HIT ]──► Return (~2ms, $0)
                     │     (Context Hash)    │
                     └───────────┬───────────┘
                                 │ [ MISS ]
                     ┌───────────▼───────────┐
                     │    Semantic Search    │
                     │  (Qdrant Hybrid BGE)  │
                     └───────────┬───────────┘
                                 │ [ CANDIDATE FOUND ]
                     ┌───────────▼───────────┐
                     │      SAFETY GATE      │
                     │  - Knowledge Version  │
                     │  - Dynamic TTL Fresh  │
                     │  - Risk Policy Margin │
                     │  - Tenant Isolation   │
                     └───────────┬───────────┘
                                 │
                        ┌────────┴────────┐
                        ▼                 ▼
                  [ ✅ SAFE HIT ]   [ ❌ REJECT / MISS ]
                        │                 │
                  Return Cached     Forward to Provider
                  Response (~15ms)  (Groq / OpenAI)
                                          │
                                    Write-back & Return
```

---

## 🚀 Quickstart

### 1. Using TypeScript SDK (`@memolm/sdk`)

```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({
  baseURL: "http://localhost:8000",
  defaultTenant: "acme-corp",
  defaultKnowledgeVersion: "v1.0",
});

// Standard completion
const response = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [{ role: "user", content: "What is our return policy?" }],
  knowledgeVersion: "v1.0",
  risk: "low",
});

console.log(response.choices[0].message.content);
console.log("Cache Hit:", response._memolm.hitType); // EXACT_CACHE_HIT / SEMANTIC_CACHE_HIT / LLM_CALL
console.log("Latency:", response._memolm.latencyMs, "ms");
```

#### Streaming with TypeScript SDK:
```typescript
const stream = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [{ role: "user", content: "Explain quantum computing in 3 sentences." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

---

### 2. Using Python SDK (`memolm`)

```python
from memolm import MemoLM

client = MemoLM(base_url="http://localhost:8000")

response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "Can I get my money back?"}],
    knowledge_version="v1.0",
    risk="low",
)

print(response.choices[0].message.content)
print("Hit Type:", response.memolm_metadata.hit_type)
print(f"Cost Saved: ${response.memolm_metadata.estimated_cost_usd:.5f}")
```

---

### 3. Drop-in OpenAI Client Wrapping

#### TypeScript:
```typescript
import OpenAI from "openai";
import { wrapOpenAI } from "@memolm/sdk";

const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), {
  gatewayURL: "http://localhost:8000",
  failOpen: true, // Automatically fails open to OpenAI if Gateway is unreachable
});
```

#### Python:
```python
from openai import OpenAI
from memolm import wrap_openai

client = wrap_openai(OpenAI(), gateway_url="http://localhost:8000", fail_open=True)
```

---

> 📖 **Full SDK Documentation & Guide:** See [SDK_GUIDE.md](SDK_GUIDE.md) for complete Python and TypeScript SDK setup, streaming, cache invalidation, and session telemetry.

---

## 🛡️ The Safety Gate

Every candidate match is evaluated against strict constraints:

| Safety Check | Rule / Condition | On Failure |
| :--- | :--- | :--- |
| **Knowledge Version** | `cached.knowledge_version == current` | ❌ Rejects stale documentation ➔ Routes to fresh LLM |
| **Dynamic TTL** | `now < cached.created_at + ttl` | ❌ Expired entry ➔ Routes to LLM |
| **Domain Risk Policy** | Similarity margin vs risk level (e.g. Low: 0.85, High: 0.96) | ❌ Below safety threshold ➔ Routes to LLM |
| **Tenant Boundary** | Multi-tenant namespace matching | ❌ Cross-tenant isolation violation ➔ Blocked |

---

## 📊 Live Observability & Realtime Frontend Playground

MemoLM includes a Next.js real-time playground and dashboard:
* **Interactive Chat Playground (`/chat`)**: Test live exact and semantic cache hits using `@memolm/sdk`.
* **Telemetry Ribbon**: Track session hit rates, cost saved ($), and latency saved (seconds).
* **Instant Cache Invalidation**: Invalidate cache by tenant or knowledge version with a single click.

```bash
# Start backend gateway
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Start frontend
cd frontend && npm run dev
```

---

## 📄 License
MIT License.
