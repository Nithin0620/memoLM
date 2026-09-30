# @memolm/sdk ⚡🛡️

> The official TypeScript & JavaScript SDK for **MemoLM** — Safe Semantic Caching & Response Firewall for LLMs.

[![npm version](https://img.shields.io/npm/v/@memolm/sdk.svg?style=flat-square&color=6366f1)](https://www.npmjs.com/package/@memolm/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@memolm/sdk.svg?style=flat-square)](https://www.npmjs.com/package/@memolm/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 📦 Installation

```bash
npm install @memolm/sdk
```
```bash
pnpm add @memolm/sdk
# or
yarn add @memolm/sdk
# or
bun add @memolm/sdk
```

---

## 🚀 Quickstart

### 1. Initialize Client

```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({
  baseURL: "http://localhost:8000",   // URL of your MemoLM Gateway
  defaultTenant: "acme-corp",         // Default tenant namespace
  defaultKnowledgeVersion: "v1.0",    // Default knowledge version for Safety Gate
  defaultRisk: "low",                 // Default risk level
});
```

---

### 2. Standard Chat Completion

```typescript
const response = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is the return policy?" }
  ],
  knowledgeVersion: "v1.0",
  tenantId: "acme-corp",
  risk: "low"
});

console.log(response.choices[0].message.content);

// Explainability & Cache Telemetry
console.log("Hit Type:", response._memolm.hitType);
console.log("Latency:", response._memolm.latencyMs, "ms");
console.log("Estimated Cost:", response._memolm.estimatedCostUsd);
```

---

### 3. Real-Time Streaming (SSE)

```typescript
const stream = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [
    { role: "user", content: "Explain semantic caching in 2 sentences." }
  ],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

---

### 4. Drop-in OpenAI Client Wrapping (`wrapOpenAI`)

Wrap an existing `OpenAI` client with zero code changes:

```typescript
import OpenAI from "openai";
import { wrapOpenAI } from "@memolm/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = wrapOpenAI(openai, {
  gatewayURL: "http://localhost:8000",
  failOpen: true, // Automatically falls back to OpenAI if Gateway is unreachable
  tenantId: "acme-corp"
});

const res = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

---

### 5. Active Cache Control & Metrics

```typescript
// Invalidate cache for a tenant or knowledge version
await client.cache.invalidate({
  tenantId: "acme-corp",
  version: "v1.0"
});

// Inspect cache candidates
const inspect = await client.cache.inspect({
  query: "What is the return policy?",
  tenantId: "acme-corp",
  version: "v1.0"
});
console.log(inspect);

// Session Metrics
console.log("Cache Hit Rate:", client.sessionMetrics.hitRatePct + "%");
console.log("Cost Saved:", "$" + client.sessionMetrics.estimatedCostSavedUsd);
```

---

## 📄 License
MIT
