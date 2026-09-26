# MemoLM Backend (Core Engine & Gateway)

FastAPI async gateway with Qdrant semantic cache (single store) and the Safety Gate engine.

## API Gateway (`main.py`)

`main.py` is the live FastAPI implementation of the OpenAI/Groq-compatible `POST /openai/v1/chat/completions` endpoint. It runs with `uvicorn` (`127.0.0.1:8000`, `--reload`) and uses **Groq (`openai/gpt-oss-20b`) as the upstream LLM**.

The route carries the `/openai` prefix on purpose: the official Groq SDK appends `/chat/completions` itself, so pointing it at `base_url="http://127.0.0.1:8000"` resolves to the path above. A `base_url` of `.../v1` would land on `/v1/chat/completions`, which does not exist.

The model is read from `GROQ_MODEL` (default `openai/gpt-oss-20b`) in both `main.py` and `chat.py`. Model access is **per-API-key** — check what your key can actually reach with:

```bash
curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```

A model your key cannot reach returns an upstream `404`, which the gateway surfaces as a `502` (non-streaming) or an error frame before `data: [DONE]` (streaming).

The gateway keeps **two views of the same conversation**:

- **Cache lookup** embeds only `cache_messages` — the last 10 turns only. The context chain then trims further only if the stitched text would exceed the embedding model's 512-token window, keeping embeddings fast without diluting the vector.
- **Cache HIT** serves the stored answer instantly. With `stream=True` it re-emits the cached text as fake SSE chunks (same typing effect); otherwise it returns a `chat.completion`-shaped JSON with the verdict under `memolm_stats`.
- **Cache MISS** forwards `full_messages` to Groq (streaming or not), pipes the response back to the client, then writes it to the cache via `save_to_cache` — but only when `dynamic_ttl` resolved `ttl > 0`.

MemoLM headers consumed by the gateway:

| Header | Required | Behavior |
| :-- | :-- | :-- |
| `x-memolm-tenant` | optional | Tenant isolation (default `"default-tenant"`). |
| `x-memolm-version` | **yes** | `knowledge_version` for the Safety Gate. If missing, the cache is skipped entirely and the request always goes to the LLM — **there is no silent default**. |
| `x-memolm-risk` | not read yet | The gateway currently **hardcodes `risk="low"`** in `main.py`, so every request is scored against the strictest `0.95` bar. Wiring this header to the Safety Gate is a one-line change. |


## Test client (`chat.py`)

> **Note:** earlier revisions of this file documented a `test_client.py`. That file no longer exists — it was replaced by `chat.py`.

`chat.py` is an interactive end-to-end client. It points the official Groq SDK at the local gateway and streams a response, printing chunks as they arrive:

```python
client = Groq(base_url="http://127.0.0.1:8000", api_key="memo-key")  # key is ignored
client.chat.completions.create(
    model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
    messages=chat_history,
    stream=True,
    extra_headers={"x-memolm-tenant": "acme-corp", "x-memolm-version": "v12"},
)
```

Because it keeps a rolling `chat_history`, it is also the easiest way to **prove the Safety Gate on stage**. Type a question, let it populate the cache, then type:

```
version v13
```

Every subsequent question now carries `x-memolm-version: v13` while the cached points are still stamped `v12` — Check A rejects them, the gateway calls Groq fresh, and the invalidation is visible in one line of typing.

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
  - `build_context_string(current_query, past_messages)` — appends the present query to the prior turns, keeps the last `MAX_MESSAGES_TO_KEEP` (10), then drops oldest turns while estimated tokens exceed `MAX_TOKENS_ALLOWED` (512, bge-small's window), stitching with `". "`. A single trailing message is never dropped, so the current query is always embedded.
  - `embed_with_context(current_query, past_messages)` — embeds the stitched context + query as **one vector**. This is the function Qdrant calls on both read and write.
  - `estimate_tokens(text)` — a `len(text) // 4` heuristic (never returns 0), not a real tokenizer.

Imports are fully explicit:

```python
from embedding.embedding import embed, embed_text
from embedding.context_chain import build_context_string, embed_with_context
```

The embedding path runs **fully offline** — `fastembed` executes ONNX locally, so there is no API key and no per-call cost for the vector side. (The upstream LLM is Groq and is a network call; only a cache HIT avoids it.)

### Context flow (context comes from the incoming `messages` array)

```
Gateway receives full OpenAI-style messages list
  -> current_query = last message, prior = earlier messages
  -> embed_with_context(query, prior)        # one stitched, embedded vector
  -> Qdrant search with that vector
  -> on write-back store the answer + safety metadata as a point
```

## Measured behaviour

Real end-to-end timings against live Groq + Qdrant Cloud (`openai/gpt-oss-20b`), captured with `chat.py`:

| Step | Request | Result | Wall time |
| :-- | :-- | :-- | :-- |
| 1 | cold ask, `x-memolm-version: v12` | LLM call, answer cached | **2612 ms** |
| 2 | same question, same `v12` | `SAFE_CACHE_HIT` @ 1.000 | **289 ms** |
| 3 | same question, bumped to `v13` | Safety Gate Check A rejects stale `v12`, fresh LLM call | **2053 ms** |

Step 2 → 3 is the important pair: the *only* difference is the version header, and it is enough to force a fresh LLM call. That is instant cache invalidation, demonstrated end to end.

The cache HIT is ~9x faster than the LLM call, not the ~98x the architecture docs claim. Two honest caveats on that number:

- The gateway deliberately re-emits a HIT as fake SSE chunks with a `time.sleep(0.01)` between 15-character chunks to reproduce the typing effect. For a ~300-character answer that adds ~200 ms of the 289 ms. **The lookup itself is tens of milliseconds; the typing effect is the dominant cost.**
- `latency_saved` in the response payload is currently a hardcoded estimate (`round(1.2 - 0.02, 2)`), not a measurement. Do not quote it as a real number on stage.

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

### Operational notes

Two things to know before touching Qdrant:

- **The collection is created on startup, indexes included.** `ensure_collection()` runs from the FastAPI startup hook and creates the collection *and* the payload indexes. This matters because Qdrant **rejects any filtered search whose filter key has no index**:
  ```
  400  Index required but not found for "tenant_id" of type [keyword]
  ```
  Indexed fields: `tenant_id`, `provider`, `model`, `knowledge_version`, `prompt_version`, `risk`. The first three are the hard pre-filter; the rest are Safety Gate inputs, indexed up front so they can be pushed into the filter without a reindex.
- **Only one candidate is ever evaluated.** The search uses `limit=1`, so despite the plural wording above, the gate inspects at most a single point. That is fine while `SIMILARITY_FLOOR` is high, but a stale entry that outranks a valid one will cause a miss rather than a fallthrough. Raising `limit` and iterating is the intended hardening.

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