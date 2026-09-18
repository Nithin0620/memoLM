# 3b. MemoLM TypeScript / JavaScript SDK (`@memolm/sdk`) 🔷

**Owner:** TypeScript SDK Developer  
**Tech Stack:** TypeScript, `fetch` / `openai` wrapper, Zero-external-bloat

---

## 🎯 Goal & Responsibilities
Create a fully typed, modern TypeScript/JavaScript client library that works across Node.js, Next.js, Bun, and Edge runtimes.

---

## 📋 Detailed Requirements

### 1. Package Structure
```
sdk/typescript/
├── src/
│   ├── index.ts
│   ├── client.ts
│   ├── types.ts
│   └── errors.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 2. Client Interface Design
```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({
  baseURL: "http://localhost:8000/v1",
  apiKey: process.env.MEMOLM_API_KEY,
  defaultTenant: "default",
  defaultKnowledgeVersion: "v1",
});

async function main() {
  const response = await client.chat({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a customer support agent." },
      { role: "user", content: "How do I get a refund?" }
    ],
    knowledgeVersion: "v12",
    risk: "low",
    tenantId: "customer_123"
  });

  // Standard response
  console.log(response.choices[0].message.content);

  // MemoLM explainability
  console.log(response._memolm.hitType);          // "SEMANTIC_CACHE_HIT"
  console.log(response._memolm.similarity);       // 0.942
  console.log(response._memolm.safetyVerdict);    // "SAFE"
}

main();
```

### 3. Key Responsibilities
* Full TypeScript typings for request options and response payloads (`MemoLMResponse`, `SafetyVerdict`).
* Automatically injects `x-memolm-*` headers.
* Compatible with both browser/client-side and server-side runtimes (Node 18+, Edge).
* Clean error handling and typed response inspection.
