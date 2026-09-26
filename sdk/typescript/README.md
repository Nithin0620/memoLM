# @memolm/sdk ⚡🛡️

The official TypeScript and JavaScript SDK for **MemoLM** — the intelligent LLM response firewall and safe semantic cache gateway.

---

## 📦 Installation

```bash
npm install @memolm/sdk
# or
pnpm add @memolm/sdk
# or
yarn add @memolm/sdk
# or
bun add @memolm/sdk
```

---

## 🚀 Quickstart

### 1. Initialize the Client

```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({
  baseURL: "http://localhost:8000", // URL of your MemoLM Gateway
  apiKey: "memo-key",               // Optional for local/self-hosted
  defaultKnowledgeVersion: "v12",   // Default knowledge version for Safety Gate
  defaultTenant: "acme-corp",       // Default tenant namespace
});
```

---

### 2. Standard Chat Completion (JSON Mode)

```typescript
const response = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is the return policy?" }
  ],
  knowledgeVersion: "v12", // First-class Safety Gate check
  tenantId: "acme-corp",
  risk: "low"
});

console.log(response.choices[0].message.content);

// Explainability Metadata
if (response.memolm_stats) {
  console.log(`Cache Verdict: ${response.memolm_stats.verdict}`);
  console.log(`Similarity: ${response.memolm_stats.similarity}`);
  console.log(`Latency Saved: ${response.memolm_stats.latency_saved}s`);
}
```

---

### 3. Real-Time Streaming (SSE)

```typescript
const stream = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [
    { role: "user", content: "Explain how bubble sort works." }
  ],
  knowledgeVersion: "v12",
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || "";
  process.stdout.write(content);
}
```

---

## 🛡️ The Safety Gate & Instant Invalidation

When business rules, policies, or documentation change, simply bump the `knowledgeVersion` (e.g., from `"v12"` to `"v13"`). MemoLM's Safety Gate will **instantly invalidate all outdated cached responses without deleting any database records**:

```typescript
// Request with updated knowledge version
const response = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [{ role: "user", content: "What is the return policy?" }],
  knowledgeVersion: "v13", // Stale v12 cache entries are automatically rejected!
});
```

---

## ⚙️ Configuration & Options

### `MemoLMClientConfig`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `baseURL` | `string` | `"http://localhost:8000"` | Gateway base URL. |
| `apiKey` | `string` | `"memo-key"` | Gateway authentication or provider API key. |
| `defaultTenant` | `string` | `"default-tenant"` | Default multi-tenant isolation namespace. |
| `defaultKnowledgeVersion` | `string` | `"v1"` | Default knowledge version for Safety Gate. |
| `defaultRisk` | `"low" \| "medium" \| "high"` | `"low"` | Default risk policy threshold. |
| `defaultHeaders` | `Record<string, string>` | `{}` | Custom headers sent on every request. |

### `ChatCompletionCreateParams`

| Option | Type | Description |
| :--- | :--- | :--- |
| `model` | `string` | Target model name (e.g. `gpt-4o`, `openai/gpt-oss-20b`, `llama-3.3-70b`). |
| `messages` | `Message[]` | Array of chat messages (`role` and `content`). |
| `knowledgeVersion` | `string` | Version tag for the Safety Gate (e.g. `"v12"`). |
| `tenantId` | `string` | Tenant namespace for strict data boundary isolation. |
| `risk` | `"low" \| "medium" \| "high"` | Risk policy governing similarity threshold. |
| `stream` | `boolean` | If `true`, returns an async iterator stream of SSE chunks. |
| `temperature` | `number` | Sampling temperature. |
| `max_tokens` | `number` | Maximum tokens to generate. |

---

## 📄 License

MIT
