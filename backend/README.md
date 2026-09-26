# MemoLM Backend (Core Engine & Gateway)

FastAPI async gateway with Qdrant semantic cache (single store) and the Safety Gate engine.

## API Gateway (`main.py`)

`main.py` is the live FastAPI implementation of the OpenAI/Groq-compatible `POST /v1/chat/completions` endpoint. It runs with `uvicorn` (`127.0.0.1:8000`, `--reload`) and uses **Groq (`llama-3.3-70b-versatile`) as the upstream LLM**.

The gateway keeps **two views of the same conversation**:

- **Cache lookup** embeds only `cache_messages` — the context chain then rolls it down to the last 5 turns, keeping embeddings fast without diluting the vector.
- **Cache HIT** serves the stored answer instantly. With `stream=True` it re-emits the cached text as fake SSE chunks (same typing effect, ~20 ms); otherwise it returns a `chat.completion`-shaped JSON with the verdict under `memolm_stats`.
- **Cache MISS** forwards `full_messages` to Groq (streaming or not), pipes the response back to the client, then writes it to the cache via `save_to_cache` — but only when `dynamic_ttl` resolved `ttl > 0`.

MemoLM headers consumed by the gateway:

| Header | Required | Behavior |
| :-- | :-- | :-- |
| `x-memolm-tenant` | optional | Tenant isolation (default `"default-tenant"`). |
| `x-memolm-version` | **yes** | `knowledge_version` for the Safety Gate. If missing, the cache is skipped entirely and the request always goes to the LLM — **there is no silent default**. |


## Test client (`test_client.py`)

`test_client.py` is a minimal end-to-end smoke test. It points the official Groq SDK at the local gateway (`base_url="http://127.0.0.1:8000/v1"`) and makes a streaming request with the MemoLM headers, printing chunks as they arrive:

```python
client = Groq(base_url="http://127.0.0.1:8000/v1", api_key="memo-key")  # key is ignored
client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[...],
    stream=True,
    extra_headers={"x-memolm-tenant": "acme-corp", "x-memolm-version": "v1"},
)
```

## Dynamic TTL (Semantic Routing)

`dynamic_ttl.py` decides how long a cached answer stays valid. It is a **hybrid router**: explicit keyword hits boost a TTL bucket deterministically (e.g. `"breaking"`, `"how to"`, `"password"`, `"now"`), and the embedding model (`BAAI/bge-small-en-v1.5`) routes paraphrases via cosine similarity against **8 anchor vectors per bucket**. A confidence floor plus a winner-margin gate makes ambiguous queries fall back to the default TTL instead of guessing.

`get_semantic_ttl` can also force *never cache* for high-risk requests via `risk_level="high"`.

| TTL | seconds |
| :-- | :-- |
| never cache | 0 |
| 3 min | 180 |
| 10 min | 600 |
| 1 hr | 3600 |
| 5 hr | 18000 |
| 10 hr | 36000 |
| 17 hr | 61200 |
| 24 hr | 86400 |
| 5 days | 432000 |
| 10 days | 864000 |
| 15 days | 1296000 |
| 22 days | 1900800 |
| 30 days | 2592000 |

```python
from dynamic_ttl import get_semantic_ttl

get_semantic_ttl("What is the current stock price of Tesla?")       # -> 86400
get_semantic_ttl("Any breaking news right now?")                    # -> 180
get_semantic_ttl("Explain how quicksort works")                     # -> 2592000
get_semantic_ttl("Can I take ibuprofen with beta blockers?")        # -> 0  (never cache)
get_semantic_ttl("call the provider", risk_level="high")            # -> 0  (never cache)
```

A returned TTL of `0` means "never cache" — the Safety Gate treats every candidate as expired (`now > created_at + 0`), so these requests always route to the upstream LLM.

The `0` bucket (medical, legal, financial-personal, credentials/security) catches critical queries that should not be cached at all. It also matches the bare keyword `"now"`, so "right now"-style current-moment phrasing (which goes stale the instant it's answered) is biased toward never-caching too. Anchor prompts and keywords are defined in `TTL_BUCKETS` (one `anchors` list and one `keywords` list per bucket) and are easy to tune.

## Embedding (`embedding/` package)

The `embedding/` package wraps the `BAAI/bge-small-en-v1.5` model so the TTL router and the Qdrant search pipeline share one model instance.

- `embedding/embedding.py` — the model wrapper:
  - `get_model()` — loads the model the first time it's needed and reuses it forever after (simple `_model` cache, no magic).
  - `embed(texts)` — embeds a list of texts in one batch and converts the results to `numpy` arrays.
  - `embed_text(text)` — convenience wrapper: pass one string, get one vector back.
- `embedding/context_chain.py` — rolling-context stitching (Pronoun Problem):
  - `build_context_text(current_query, recent_messages)` — appends the present query to the prior turns, keeps the last `CONTEXT_CAP` (5), drops oldest turns while estimated tokens exceed 512 (bge-small's window), then stitches with `". "`.
  - `embed_with_context(current_query, recent_messages)` — embeds the stitched context + query as **one vector**.

Imports are fully explicit:

```python
from embedding.embedding import embed, embed_text
from embedding.context_chain import build_context_text, embed_with_context
```

All runs fully offline after the first model download — no API key, no per-call cost.

### Context flow (context comes from the incoming `messages` array)

```
Gateway receives full OpenAI-style messages list
  -> current_query = last message, prior = earlier messages
  -> embed_with_context(query, prior)        # one stitched, embedded vector
  -> Qdrant search with that vector
  -> on write-back store the answer + safety metadata as a point
```

## Database Store (`database/qdrant_store.py`)

MemoLM uses **Qdrant** as its unified vector and cache store. Every cached response is saved as a Qdrant Point containing:
- **Vector**: 384-dimensional dense embedding of the context-stitched conversation.
- **Payload**: Full metadata including `tenant_id`, `provider`, `model`, `knowledge_version`, `created_at`, `expiry`, and `response`.

### Safety Gate checks (`fetch_from_cache`)

Every candidate found in Qdrant must pass all checks before it is returned:

```python
# Check A — knowledge_version must match the request version
# Check B — entry must not be past its `expiry` (TTL from semantic routing)
# Check C — similarity must clear the risk-gated threshold
risk_thresholds = {"low": 0.95, "medium": 0.90, "high": 0.85}
```

The Qdrant pre-search itself filters at `SIMILARITY_FLOOR = 0.90` (`qdrant_store.py`) and hard-filters on `tenant_id`, `provider`, and `model`. If **no `knowledge_version` is provided, the lookup returns `None` immediately** — the cache never guesses the data version.

### Instant Cache Invalidation (`knowledge_version`)
Instead of deleting thousands of vectors when policies or business documents change, MemoLM uses a simple **`knowledge_version`** tag:

1. **Tag on Save**: When saving to Qdrant, the point payload records `"knowledge_version": version` (e.g., `"v1"`).
2. **Verify on Fetch (Safety Gate)**: When querying, the Safety Gate compares the cached version with the incoming version:
   ```python
   cached_version = payload.get("knowledge_version", "")
   if cached_version != request_version:
       return None  # Instant Cache Miss -> Safely routes to LLM
   ```
3. **Instant Global Cache Busting**: Bumping the company's knowledge version (e.g., from `v1` to `v2`) instantly invalidates all outdated answers with **zero deletion latency** and **zero downtime**.