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

## Embedding (`embedding.py`)

`embedding.py` wraps the `BAAI/bge-small-en-v1.5` model so both the TTL router and the Qdrant search pipeline share one model instance.

- `get_model()` — loads the model the first time it's needed and reuses it forever after (simple `_model` cache, no magic).
- `embed(texts)` — embeds a list of texts in one batch and converts the results to `numpy` arrays.
- `embed_text(text)` — convenience wrapper: pass one string, get one vector back.

This runs fully offline after the first download — no API key, no per-call cost.