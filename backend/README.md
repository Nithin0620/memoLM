# MemoLM Backend (Core Engine & Gateway)

FastAPI async gateway with Redis exact cache, Qdrant semantic search, and the Safety Gate engine.



## Dynamic TTL (Semantic Routing)

`dynamic_ttl.py` decides how long a cached answer stays valid. It is a **hybrid router**: explicit keyword hits boost a TTL bucket deterministically (e.g. `"breaking"`, `"how to"`, `"password"`), and the embedding model (`BAAI/bge-small-en-v1.5`) routes paraphrases via cosine similarity against **8 anchor vectors per bucket**. A confidence floor plus a winner-margin gate makes ambiguous queries fall back to the default TTL instead of guessing.

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

The `0` bucket (medical, legal, financial-personal, credentials/security) catches critical queries that should not be cached at all. Anchor prompts and keywords are defined in `TTL_BUCKETS` (one `anchors` list and one `keywords` list per bucket) and are easy to tune.

## Embedding (`embedding/` package)

The `embedding/` package wraps the `BAAI/bge-small-en-v1.5` model so the TTL router and the Qdrant search pipeline share one model instance.

- `embedding/embedding.py` — the model wrapper:
  - `get_model()` — loads the model the first time it's needed and reuses it forever after (simple `_model` cache, no magic).
  - `embed(texts)` — embeds a list of texts in one batch and converts the results to `numpy` arrays.
  - `embed_text(text)` — convenience wrapper: pass one string, get one vector back.
  - `embed_messages_with_context(messages)` — request-level stitcher: takes a full `messages` array, slices the last 5, stitches, embeds.
- `embedding/context_chain.py` — server-side rolling context (Single-Query Context Problem):
  - `session_key(session_id)` — the Redis list key `memolm:session:{sid}:messages`.
  - `build_context_text(current_query, recent_messages)` — appends the present query to the stored texts, keeps the last 5, drops oldest turns while estimated tokens exceed 512 (bge-small's window), then stitches with `". "`.
  - `embed_with_context(current_query, recent_messages)` — embeds the stitched context + query as **one vector**.
  - `payload_fields_for(current_query, recent_messages)` — the `context_queries` / `context_text` / `chain_depth` fields to store in the Qdrant point on write-back.

The package intentionally has **no `__init__.py`** (a namespace package) — imports are fully explicit:

```python
from embedding.embedding import embed, embed_text, embed_messages_with_context
from embedding.context_chain import build_context_text, embed_with_context, payload_fields_for
```

All runs fully offline after the first model download — no API key, no per-call cost.

### Context flow (API sends only the present query)

```
Redis  memolm:session:{sid}:messages = ["I like the Camry", "what is the price", ...]
  -> append present query, LTRIM to 5
  -> embed_with_context(query, stored_texts)   # one stitched, embedded vector
  -> Qdrant search with that vector
  -> on write-back store payload_fields_for(...) so repeats embed identically
```

    