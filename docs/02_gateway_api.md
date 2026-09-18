# 02. Gateway & Provider API Specification

## 🌐 Gateway Endpoint

`POST /v1/chat/completions`

The MemoLM gateway is 100% wire-compatible with the standard OpenAI Chat Completions API.

---

## 📥 Request Format

### Standard OpenAI Payload
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a helpful customer support agent."},
    {"role": "user", "content": "Can I get a refund for my order?"}
  ],
  "temperature": 0.7
}
```

### Supported MemoLM Custom Headers
Developers can pass safety context via HTTP headers (or SDK arguments):

| Header | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `x-memolm-tenant` | `string` | `"default"` | Tenant identifier for multi-tenant isolation |
| `x-memolm-knowledge-version` | `string` | `"v1"` | Monotonic version string of current knowledge base/docs |
| `x-memolm-prompt-version` | `string` | `"v1"` | Version of system prompt / agent template |
| `x-memolm-risk` | `string` | `"low"` | Risk category: `low`, `medium`, `high` |
| `x-memolm-ttl` | `integer` | `86400` | Custom TTL in seconds for storing fresh responses |
| `x-memolm-provider` | `string` | `auto` | Force provider (`openai` or `gemini`). Auto-detects from `model` name if omitted |

---

## 📤 Response Format

MemoLM returns standard OpenAI completions schema with an added `_memolm` metadata header/object for complete explainability:

```json
{
  "id": "chatcmpl-memolm-99a81",
  "object": "chat.completion",
  "created": 1740000020,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Refunds are available within 30 days of purchase."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 11,
    "total_tokens": 26
  },
  "_memolm": {
    "hit_type": "SEMANTIC_CACHE_HIT",
    "similarity": 0.942,
    "latency_ms": 22.4,
    "estimated_cost_usd": 0.0,
    "safety_verdict": "SAFE",
    "matched_query": "What is the return policy?",
    "rejection_reasons": []
  }
}
```

---

## 🔌 Supported Upstream Providers

1. **OpenAI:**
   * Models: `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`, etc.
   * Authentication: upstream `OPENAI_API_KEY`
2. **Google Gemini:**
   * Models: `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`
   * Authentication: upstream `GEMINI_API_KEY`
