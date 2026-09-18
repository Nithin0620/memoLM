# 04. Client SDKs (Python & TypeScript)

MemoLM provides two lightweight client libraries in addition to native OpenAI compatibility.

---

## 🐍 1. Python SDK (`memolm-py`)

### Installation
```bash
pip install memolm
```

### Usage
```python
from memolm import MemoLM

# Initialize client
client = MemoLM(
    base_url="http://localhost:8000/v1",
    api_key="your-api-key"
)

# Chat completion with explicit safety metadata
response = client.chat(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "How do I request a refund?"}
    ],
    tenant_id="customer_org_101",
    knowledge_version="v12",
    risk="low",
    ttl_seconds=3600
)

print(response.choices[0].message.content)
print(response.memolm_metadata)
# {
#   "hit_type": "SEMANTIC_CACHE_HIT",
#   "similarity": 0.942,
#   "latency_ms": 18.2,
#   "safety_verdict": "SAFE"
# }
```

---

## 🔷 2. TypeScript SDK (`@memolm/sdk`)

### Installation
```bash
npm install @memolm/sdk
```

### Usage
```typescript
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({
  baseURL: "http://localhost:8000/v1",
  apiKey: process.env.MEMOLM_API_KEY,
});

async function main() {
  const response = await client.chat({
    model: "gpt-4o",
    messages: [
      { role: "user", content: "Can I return my item for store credit?" }
    ],
    tenantId: "customer_org_101",
    knowledgeVersion: "v12",
    risk: "low",
  });

  console.log(response.choices[0].message.content);
  console.log(response._memolm);
}

main();
```

---

## 🔄 3. Zero-Code Migration with OpenAI SDK

If you already have an existing codebase using the official OpenAI SDK, you do not need to install anything new:

```python
import os
from openai import OpenAI

# Simply point base_url to MemoLM Gateway!
client = OpenAI(
    base_url=os.getenv("MEMOLM_BASE_URL", "http://localhost:8000/v1"),
    api_key=os.getenv("OPENAI_API_KEY")
)

# Works out of the box
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is the return policy?"}],
    extra_headers={
        "x-memolm-knowledge-version": "v12",
        "x-memolm-risk": "low"
    }
)
```
