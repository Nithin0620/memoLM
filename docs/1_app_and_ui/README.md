# 1. MemoLM App & UI (Dashboard + Playground) 🖥️

**Owner:** Frontend Developer  
**Tech Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Lucide Icons, Tremor / Recharts

---

## 🎯 Goal & Responsibilities
Build a unified, responsive single-page web application containing both the **Observability Dashboard** and the **Interactive Playground**.

---

## 📋 Detailed Requirements

### 1. Interactive Live Playground
* **Chat Interface:** ChatGPT-like message container.
* **Header Controls (Crucial for Demo):**
  * `Knowledge Version` selector / input (e.g. `v12` ➔ toggle to `v13`).
  * `Risk Level` dropdown (`low`, `medium`, `high`).
  * `Provider / Model` toggle (`OpenAI gpt-4o` vs `Gemini 1.5 Flash`).
  * `Tenant ID` input (`default`).
* **Explainability Response Card:**
  Underneath every assistant response, render the `_memolm` verdict:
  * 🟡 **LLM Call:** Latency (e.g. `1.24s`), Cost (e.g. `$0.0031`), Provider used.
  * 🟢 **Safe Semantic Cache Hit:** Latency (e.g. `18ms`), Similarity (e.g. `94.2%`), Matched original query, Green checkmarks for:
    * `[✓ Tenant Match]`
    * `[✓ Model Match]`
    * `[✓ Knowledge Version Match]`
    * `[✓ TTL Valid]`
    * `[✓ Risk Policy Allowed]`
  * 🔴 **Safety Gate Rejected:** Red banner showing exact rejection reason (e.g., `knowledge_version_mismatch: cached=v12, requested=v13`) and indicator that request was safely forwarded to upstream LLM.

### 2. Observability Dashboard
* **KPI Stats Grid:**
  * Total Requests Processed
  * Exact Cache Hits (~5ms)
  * Semantic Cache Hits (~20ms)
  * Total LLM Calls Avoided
  * **Cache Hit Rate (%)**
  * **Estimated Cost Saved ($)**
  * **Estimated Latency Saved (Hours / Seconds)**
* **Charts:**
  * Hourly / Real-time Request Flow (Hits vs Misses).
  * Latency Distribution Comparison (LLM 1.2s vs Cache 20ms).
* **Live Audit Stream:**
  * Realtime event log of recent requests with filter by status (`HIT`, `MISS`, `REJECTED`).
  * Rejection reason breakdown histogram (`knowledge_changed`, `ttl_expired`, `risk_violation`).

---

## 🔌 API Endpoints to Consume
* `POST /v1/chat/completions` (Direct playground calls)
* `GET /api/metrics` (Live summary counters for the dashboard)
* `GET /api/audit-stream` (Recent requests & safety gate decisions)
