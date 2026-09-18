# 1. App & UI: Components, State & Integration Specs 🧩

**Module:** `1_app_and_ui`  
**Purpose:** Precise component contracts, wireframe layouts, and API integration specifications for the Frontend Developer.

---

## 📐 1. UI Layout & Wireframe Specification

### Main Unified View (`app/page.tsx`)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ⚡ MemoLM Gateway  [🟢 Online - localhost:8000]          [Playground] [Dashboard] [Docs]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│  GLOBAL METRICS RIBBON                                                                 │
│  [Total Requests: 14,290]  [Cache Hit Rate: 74.2%]  [Saved: $18.42]  [Avg Latency: 22ms] │
├────────────────────────────────────────────────────────────┬───────────────────────────┤
│  INTERACTIVE PLAYGROUND                                    │  LIVE INSPECTOR / STATS   │
│                                                            │                           │
│  [KV: v12 (Active) ▼] [Risk: Low ▼] [Model: gpt-4o ▼]      │  ACTIVE REQUEST TRACE     │
│  ────────────────────────────────────────────────────────  │  Status: 🟢 SAFE HIT      │
│  [User 01:15 PM]                                           │  Similarity: 94.2%        │
│  What is your refund policy?                               │  Matched: "What is your   │
│                                                            │           refund policy?" │
│  [MemoLM Assistant]                                        │                           │
│  Refunds are available within 30 days of purchase.         │  SAFETY CHECKS:           │
│  ┌──────────────────────────────────────────────────────┐  │  ✓ Tenant Isolation       │
│  │ 🟡 LLM CALL · 1.24s · $0.0031 · Stored to Cache (v12) │  │  ✓ Model Match (gpt-4o)   │
│  └──────────────────────────────────────────────────────┘  │  ✓ Knowledge Version (v12)│
│                                                            │  ✓ TTL Valid (86390s left)│
│  [User 01:16 PM]                                           │  ✓ Risk Policy (Low)      │
│  Can I get my money back?                                  │                           │
│                                                            │  LATENCY SAVINGS:         │
│  [MemoLM Assistant]                                        │  LLM Baseline:   1,240 ms │
│  Refunds are available within 30 days of purchase.         │  MemoLM Response:   19 ms │
│  ┌──────────────────────────────────────────────────────┐  │  ⚡ 1,221 ms (98.4%) Saved│
│  │ 🟢 SAFE HIT · 94.2% Sim · 19ms · $0 · [Inspect Trace]│  │                           │
│  └──────────────────────────────────────────────────────┘  │  TOKEN SAVINGS:           │
│                                                            │  Input: 24 | Output: 18   │
│  ┌──────────────────────────────────────────────────────┐  │  Cost Saved: $0.0031      │
│  │ Ask a question...                              [Send]│  │                           │
│  └──────────────────────────────────────────────────────┘  │                           │
│  Demo Prompts: [1. Refund Policy] [2. Money Back] [3. Bump KV]                         │
└────────────────────────────────────────────────────────────┴───────────────────────────┘
```

---

## 🧩 2. Core Component Specifications

### 1. `ExplainabilityCard.tsx`
This component is the centerpiece of the user experience and demo.

**Props Interface:**
```typescript
export interface ExplainabilityCardProps {
  meta: {
    hit_type: "EXACT_CACHE_HIT" | "SEMANTIC_CACHE_HIT" | "LLM_CALL" | "SAFETY_REJECTED";
    similarity?: number;
    latency_ms: number;
    estimated_cost_usd: number;
    safety_verdict: "SAFE" | "REJECTED" | "BYPASS";
    matched_query?: string;
    rejection_reasons?: string[];
    checks?: {
      tenant_valid: boolean;
      model_valid: boolean;
      prompt_version_valid: boolean;
      knowledge_version_valid: boolean;
      ttl_valid: boolean;
      risk_policy_allowed: boolean;
    };
  };
  onInspectDetails?: () => void;
}
```

**Visual States:**
1. `EXACT_CACHE_HIT`: Cyan badge (`⚡ Exact Cache Hit · 4ms · $0.0000`).
2. `SEMANTIC_CACHE_HIT`: Emerald badge (`🟢 Safe Semantic Hit · 94.2% match · 21ms · $0.0000`).
3. `LLM_CALL`: Amber badge (`🟡 Upstream LLM Call · 1.28s · $0.0032 · Stored to Cache`).
4. `SAFETY_REJECTED`: Rose badge (`🔴 Safety Gate Blocked Reuse ➔ Forwarded to LLM (Reason: Knowledge changed)`).

---

### 2. `PlaygroundHeader.tsx`
Enables instant parameter toggling so judges can see the Safety Gate in action without code changes.

```typescript
export interface PlaygroundHeaderProps {
  knowledgeVersion: string;
  onKnowledgeVersionChange: (kv: string) => void;
  riskLevel: "low" | "medium" | "high";
  onRiskLevelChange: (risk: "low" | "medium" | "high") => void;
  provider: "openai" | "gemini";
  onProviderChange: (p: "openai" | "gemini") => void;
  onBumpVersion: () => void; // Quick helper: bumps v12 -> v13 instantly
}
```

---

## 📡 3. API Integration Contract (`src/lib/api.ts`)

```typescript
export interface ChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  tenantId?: string;
  knowledgeVersion?: string;
  riskLevel?: "low" | "medium" | "high";
  ttlSeconds?: number;
}

export interface ChatResponse {
  id: string;
  choices: Array<{
    message: { role: "assistant"; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  _memolm: {
    hit_type: "EXACT_CACHE_HIT" | "SEMANTIC_CACHE_HIT" | "LLM_CALL" | "SAFETY_REJECTED";
    similarity: number;
    latency_ms: number;
    estimated_cost_usd: number;
    safety_verdict: "SAFE" | "REJECTED";
    matched_query?: string;
    rejection_reasons: string[];
    checks: {
      tenant_valid: boolean;
      model_valid: boolean;
      prompt_version_valid: boolean;
      knowledge_version_valid: boolean;
      ttl_valid: boolean;
      risk_policy_allowed: boolean;
    };
  };
}

export interface MetricsSummary {
  total_requests: number;
  exact_hits: number;
  semantic_hits: number;
  llm_calls: number;
  cache_hit_rate_pct: number;
  estimated_cost_saved_usd: number;
  total_latency_saved_sec: number;
  rejection_counts: {
    knowledge_changed: number;
    ttl_expired: number;
    risk_policy: number;
    tenant_mismatch: number;
  };
}
```

---

## 🎬 4. Demo Helper Action ("Judges Demo Button")

Include a prominent quick-action row with 3 clickable preset buttons:
1. **Button 1 (Initial Ask):** Inserts & sends *"What is your return policy?"* with `Knowledge: v12`.
2. **Button 2 (Paraphrase):** Inserts & sends *"Can I get a refund on my purchase?"* with `Knowledge: v12`.
3. **Button 3 (Knowledge Bump):** Automatically changes `Knowledge: v13` and re-sends *"Can I get a refund on my purchase?"* to trigger the **Safety Gate Rejection**.

This guarantees a flawless, 100% reliable demo presentation during hackathon judging!
