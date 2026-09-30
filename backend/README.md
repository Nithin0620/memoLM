# MemoLM Backend (Core Engine & Gateway)

FastAPI async gateway with Qdrant semantic cache (single store) and the Safety Gate engine.

## API Gateway (`main.py`)

The gateway keeps **two views of the same conversation**:

- **Cache lookup** embeds only `cache_messages` — the last 10 turns only. The context chain then trims further only if the stitched text would exceed the embedding model's 512-token window, keeping embeddings fast without diluting the vector.
- **Cache HIT** serves the stored answer instantly. With `stream=True` it re-emits the cached text as fake SSE chunks (same typing effect); otherwise it returns a `chat.completion`-shaped JSON with the verdict under `memolm_stats`.
- **Cache MISS** forwards `full_messages` to Groq (streaming or not), pipes the response back to the client, then writes it to the cache via `save_to_cache` — but only when `dynamic_ttl` resolved `ttl > 0`.

MemoLM headers consumed by the gateway:

| Header | Required | Behavior |
| :-- | :-- | :-- |
| `x-memolm-tenant` | optional | Tenant isolation (default `"default-tenant"`). |
| `x-memolm-version` | **yes** | `knowledge_version` for the Safety Gate. If missing, the cache is skipped entirely and the request always goes to the LLM — **there is no silent default**. |
| `x-memolm-risk` | not read yet | The gateway currently **hardcodes `risk="low"`** in `main.py`, so every request is scored against the strictest `0.90` bar. Wiring this header to the Safety Gate is a one-line change. |


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

`dynamic_ttl.py` decides how long a cached answer stays valid. It is a **hybrid router**: explicit keyword hits boost a TTL bucket deterministically (e.g. `"breaking"`, `"how to"`, `"password"`, `"now"`), and the embedding model (`BAAI/bge-base-en-v1.5`) routes paraphrases via cosine similarity against **8 anchor vectors per bucket**. A confidence floor plus a winner-margin gate makes ambiguous queries fall back to the default TTL instead of guessing.

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

The `0` bucket (medical, legal, financial-personal, credentials/security) catches critical queries that should not be cached at all. It also matches the bare keyword `"now"`, so "right now"-style current-moment phrasing (which goes stale the instant it's answered) is biased toward never-caching too. Keyword matching is **whole-word**, not substring, so `"now"` no longer fires inside `"known"` / `"notebook"` / `"renew"`. Anchor prompts and keywords are defined in `TTL_BUCKETS` (one `anchors` list and one `keywords` list per bucket) and are easy to tune.

## Embedding (`embedding/` package)

The `embedding/` package wraps the `BAAI/bge-base-en-v1.5` model so the TTL router and the Qdrant search pipeline share one model instance. Upgraded from `bge-small-en-v1.5` (384-dim) because paraphrase hits clustered too tightly against the old thresholds — see [Switching the embedding model](#switching-the-embedding-model) below.

- `embedding/embedding.py` — the model wrapper:
  - `get_model()` — loads the model the first time it's needed and reuses it forever after (simple `_model` cache, no magic).
  - `embed(texts)` — embeds a list of texts in one batch and converts the results to `numpy` arrays.
  - `embed_text(text)` — convenience wrapper: pass one string, get one vector back.
- `embedding/context_chain.py` — rolling-context stitching (Pronoun Problem):
  - `build_context_string(current_query, past_messages)` — appends the present query to the prior turns, keeps the last `MAX_MESSAGES_TO_KEEP` (10), then drops oldest turns while estimated tokens exceed `MAX_TOKENS_ALLOWED` (512, bge-base's window), stitching with `". "`. A single trailing message is never dropped, so the current query is always embedded.
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

Real end-to-end timings against live Groq + Qdrant Cloud (`openai/gpt-oss-20b`, `bge-base-en-v1.5`), captured with `chat.py`:

| Step | Request | Result | Wall time |
| :-- | :-- | :-- | :-- |
| 1 | cold ask, fresh version | LLM call, answer cached | **2524 ms** |
| 2 | same question, same version | `SAFE_CACHE_HIT` @ 1.0000 | **314 ms** |
| 3 | same question, bumped version | Safety Gate Check A rejects stale point, fresh LLM call | **2437 ms** |
| 4 | reworded question, same version | `LLM CALL` (paraphrase) — see note below | **2281 ms** |

Step 2 → 3 is the important pair: the *only* difference is the version header, and it is enough to force a fresh LLM call. That is instant cache invalidation, demonstrated end to end.

Step 4 is an honest limitation rather than a bug. A reworded-but-equivalent question ("How much does it set me back?" instead of "What is the price of this?") scores below the `0.90` low-risk bar, so it re-calls the LLM. That is the Safety Gate choosing correctness over hit rate: the same probe that rejected the paraphrase also had to separate it from a same-template decoy, and some of those overlap. See [Similarity distribution](#similarity-distribution-where-the-thresholds-came-from).

The cache HIT is ~8x faster than the LLM call, not the ~98x the architecture docs claim. Two honest caveats on that number:

- The gateway deliberately re-emits a HIT as fake SSE chunks with a `time.sleep(0.01)` between 15-character chunks to reproduce the typing effect. For a ~300-character answer that adds ~200 ms of the 314 ms. **The lookup itself is tens of milliseconds; the typing effect is the dominant cost.**
- `latency_saved` in the response payload is currently a hardcoded estimate (`round(1.2 - 0.02, 2)`), not a measurement. Do not quote it as a real number on stage.

### Switching the embedding model

`MODEL_NAME` and `EMBEDDING_SIZE` live in `embedding/embedding.py`; `COLLECTION_NAME` and `VECTOR_SIZE` live in `database/qdrant_store.py`. **Qdrant cannot resize a collection's vectors**, so any dimension change requires a new collection name — that is exactly why the current one is called `memolm_cache_bge_base` and the old 384-dim `memolm_cache` is left in place rather than reused.

`ensure_collection()` now asserts the existing collection's dimension against `VECTOR_SIZE` and fails loudly on a mismatch, so pointing the new model at the old collection is a startup error instead of silent garbage search results.

**The collection name is tied to the model, and the model is tied to the thresholds.** Similarity scores are not comparable across embedding models, so switching models invalidates every threshold in the Safety Gate and every anchor score in `dynamic_ttl.py`. Re-measure before trusting them.

### Similarity distribution (where the thresholds came from)

The thresholds were re-derived from a measured score distribution instead of carried over from bge-small. A raw-score probe against bge-base (Safety Gate bypassed, single saved point):

| Query | Score | Expected |
| :-- | :-- | :-- |
| exact repeat | 1.0000 | HIT |
| reordered context | 0.9801 | HIT |
| paraphrased topic | 0.8338 | HIT (misses the 0.90 bar) |
| different product | 0.6479 | MISS |
| different product, reworded | 0.5352 | MISS |

A wider offline probe (multiple HIT/MISS pairs, no prefix) showed realistic paraphrases landing at **0.9530–1.0000** and decoys at **0.3516–0.6479**, with two outliers that overlap: the hardest paraphrase sat at `0.7921` and a same-template decoy (`password` vs `email`) at `0.8078`. No single threshold separates those two cases.

`SIMILARITY_FLOOR` is therefore `0.80` — above the decoy cluster, below the paraphrase cluster — rather than the old `0.90`. **BGE's retrieval query prefix was tested and rejected**: it *lowered* the HIT/MISS separation gap (to −0.0556 from −0.0156), so no prefix is added for this symmetric design.

## Database Store (`database/qdrant_store.py`)

MemoLM uses **Qdrant** as its unified vector and cache store. Every cached response is saved as a Qdrant Point containing:
- **Vector**: 768-dimensional dense embedding of the context-stitched conversation (`bge-base-en-v1.5`).
- **Payload**: Full metadata including `tenant_id`, `provider`, `model`, `knowledge_version`, `created_at`, `expiry`, and `response`.

The current collection is `memolm_cache_bge_base`. Points written by the old bge-small build live in `memolm_cache` at 384 dimensions and are **not** readable by the current build — a cache is warmed per model, so re-run the questions you want cached after any model switch.

### Safety Gate checks (`fetch_from_cache`)

Every candidate found in Qdrant must pass all checks before it is returned:

```python
# Check A — knowledge_version must match the request version
# Check B — entry must not be past its `expiry` (TTL from semantic routing)
# Check C — similarity must clear the risk-gated threshold
risk_thresholds = {"low": 0.90, "medium": 0.85, "high": 0.80}
```

The Qdrant pre-search itself filters at `SIMILARITY_FLOOR = 0.85` (`qdrant_store.py`) and hard-filters on `tenant_id`, `provider`, and `model`. If **no `knowledge_version` is provided, the lookup returns `None` immediately** — the cache never guesses the data version.

Note that the risk bars are **inverted relative to intuition**: `high` risk has the *lowest* bar (0.80). That is deliberate — high-risk answers are usually routed to a `0` TTL by `dynamic_ttl.py` and expire immediately, so the threshold rarely matters for them, whereas low-risk answers are the ones that need to actually hit.

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