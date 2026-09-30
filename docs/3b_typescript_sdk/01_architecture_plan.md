# 3b. TypeScript SDK: Architecture & Implementation Plan 🔷

**Module:** `3b_typescript_sdk`  
**Target:** TypeScript 5.0+, Node.js (18+), Bun, Edge Runtime, tsup / Rollup for builds

---

## 🏛️ 1. Design Philosophy

The MemoLM TypeScript SDK (`@memolm/sdk`) brings ergonomic, type-safe LLM caching to JavaScript and TypeScript developers.

* **Isomorphic:** Works in Node.js, Next.js server components, browser fetch environments, and Edge workers (Cloudflare/Vercel).
* **Zero Bloat:** Uses native `fetch` (with polyfill fallback if needed) to keep package bundle size `< 10KB`.
* **Deep TypeScript Inference:** Strict autocomplete for models, roles, risk levels, and safety explainability metadata.

---

## 📁 2. Package Structure

```
sdk/typescript/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # MemoLM client class
│   ├── types.ts                  # TypeScript interfaces and types
│   └── errors.ts                 # Typed error classes
└── tests/
    └── client.test.ts
```

---

## 🧩 3. Core Implementation Specification

### `src/types.ts`
```typescript
export type RiskLevel = "low" | "medium" | "high";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  tenantId?: string;
  knowledgeVersion?: string;
  promptVersion?: string;
  risk?: RiskLevel;
  ttlSeconds?: number;
  [key: string]: any;
}

export interface SafetyChecks {
  tenantValid: boolean;
  modelValid: boolean;
  promptVersionValid: boolean;
  knowledgeVersionValid: boolean;
  ttlValid: boolean;
  riskPolicyAllowed: boolean;
}

export interface MemoLMMetadata {
  hitType: "EXACT_CACHE_HIT" | "SEMANTIC_CACHE_HIT" | "LLM_CALL" | "SAFETY_REJECTED";
  similarity: number;
  latencyMs: number;
  estimatedCostUsd: number;
  safetyVerdict: "SAFE" | "REJECTED";
  matchedQuery?: string;
  rejectionReasons: string[];
  checks?: SafetyChecks;
}

export interface MemoLMResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: Message;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  _memolm: MemoLMMetadata;
}
```

### `src/client.ts`
```typescript
import { ChatOptions, MemoLMResponse } from "./types";
import { MemoLMError } from "./errors";

export interface MemoLMConfig {
  baseURL?: string;
  apiKey?: string;
  defaultTenant?: string;
  defaultKnowledgeVersion?: string;
}

export class MemoLM {
  private baseURL: string;
  private apiKey: string;
  private defaultTenant: string;
  private defaultKnowledgeVersion: string;

  constructor(config?: MemoLMConfig) {
    this.baseURL = (config?.baseURL || "http://localhost:8000/v1").replace(/\/$/, "");
    this.apiKey = config?.apiKey || "sk-memolm-dummy";
    this.defaultTenant = config?.defaultTenant || "default";
    this.defaultKnowledgeVersion = config?.defaultKnowledgeVersion || "v1";
  }

  async chat(options: ChatOptions): Promise<MemoLMResponse> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "x-memolm-tenant": options.tenantId || this.defaultTenant,
      "x-memolm-knowledge-version": options.knowledgeVersion || this.defaultKnowledgeVersion,
      "x-memolm-risk": options.risk || "low",
      "x-memolm-ttl": String(options.ttlSeconds || 86400),
    };

    if (options.promptVersion) {
      headers["x-memolm-prompt-version"] = options.promptVersion;
    }

    const { tenantId, knowledgeVersion, promptVersion, risk, ttlSeconds, ...restPayload } = options;

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(restPayload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new MemoLMError(`MemoLM Gateway error (${res.status}): ${errorText}`, res.status);
    }

    const data = await res.json();
    return data as MemoLMResponse;
  }
}
```

---

## ⚡ 4. Implementation Milestones for TypeScript SDK Dev

1. **Milestone 1: Types & Core Fetch Client (Hours 1–2):** Implement `MemoLM` client, custom header serialization, and typed response extraction.
2. **Milestone 2: Multi-runtime testing (Hours 3–4):** Verify compatibility in Node 18, Next.js server actions, and Bun.
3. **Milestone 3: Build & Package (Hour 5):** Configure `tsup` for ESM/CJS dual-build outputs and publish scripts.
