# 05. Observability Dashboard & Interactive Playground

MemoLM ships with a unified Web Application built in **Next.js 14**, providing real-time infrastructure metrics alongside an interactive developer playground.

---

## 📊 1. Observability Dashboard

### Key Metrics Tracked
* **Cache Efficiency:** Total Requests, Exact Hits, Semantic Hits, LLM Calls Avoided, Overall Cache Hit Rate (%).
* **Economic Savings:** Estimated LLM Cost Saved ($) based on token usage.
* **Latency Speedup:** Average Latency breakdown (LLM: ~1200ms vs Exact: ~5ms vs Semantic: ~20ms).
* **Safety Gate Audit Stream:** Live stream of rejection reasons:
  * `knowledge_changed`
  * `ttl_expired`
  * `risk_policy_violation`
  * `tenant_mismatch`

---

## 🎮 2. Interactive Playground

The playground enables developers and hackathon judges to test the MemoLM firewall in real-time.

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMOLM PLAYGROUND                        │
├─────────────────────────────────────────────────────────────┤
│ Knowledge Version: [ v12 (Active) ▼ ]   Risk: [ Low ▼ ]     │
├─────────────────────────────────────────────────────────────┤
│ [User] "What is your refund policy?"                        │
│                                                             │
│ 🟡 LLM CALL (Provider: OpenAI gpt-4o)                       │
│ Latency: 1.28s | Cost: $0.0031 | Stored in MemoLM Cache     │
│ [Assistant] "Refunds are processed within 30 days."         │
├─────────────────────────────────────────────────────────────┤
│ [User] "Can I get my money back?"                           │
│                                                             │
│ 🟢 SAFE SEMANTIC CACHE HIT (Match: 94.2%)                   │
│ Latency: 19ms | Cost: $0.0000 | LLM Call Avoided!           │
│ Matched: "What is your refund policy?"                      │
│ Checks: [✓ Tenant] [✓ Model] [✓ KV] [✓ TTL] [✓ Risk]        │
│ [Assistant] "Refunds are processed within 30 days."         │
├─────────────────────────────────────────────────────────────┤
│ *Action: User increments Knowledge Version to v13*          │
├─────────────────────────────────────────────────────────────┤
│ [User] "Can I get my money back?"                           │
│                                                             │
│ 🔴 SAFETY GATE REJECTED (Similarity: 94.2%)                 │
│ Reason: Knowledge version mismatch (cached=v12, req=v13)    │
│ ➔ Forwarded to LLM (Provider: OpenAI gpt-4o)               │
│ Latency: 1.15s | Cache Updated to v13                       │
│ [Assistant] "Under policy v13, refunds are valid in 14 days"│
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 3. Judge Demo Runbook

1. **Step 1: First Query (Cold Miss)**
   * Ask: *"What is the return policy?"*
   * Observe: 🟡 1.2s LLM latency, cost incremented.
2. **Step 2: Semantic Paraphrase (Safe Hit)**
   * Ask: *"How do I get my money back?"*
   * Observe: 🟢 20ms response, $0 cost, explainability card shows 94% similarity + all green checks.
3. **Step 3: Knowledge Version Bump (The Wow Factor)**
   * Toggle Knowledge Version to `v13` in the UI header.
   * Ask again: *"How do I get my money back?"*
   * Observe: 🔴 Safety gate rejects candidate due to `knowledge_version_mismatch` and calls LLM.
