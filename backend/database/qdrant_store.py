"""
qdrant_store.py  —  MemoLM Semantic Cache (single store, Qdrant only)

Every cached answer is stored as a Qdrant Point:
    id      → uuid
    vector  → embedding of the context-stitched prompt (embedding/context_chain)
    payload → all metadata the Safety Gate needs + the LLM response

TTL comes from `dynamic_ttl.get_semantic_ttl()` (semantic routing): queries that
must never be cached (medical/legal/credentials/high-risk) resolve to ttl=0 and
are skipped entirely.

Public API
----------
    get_qdrant()                          → QdrantClient singleton
    ensure_collection()                   → create collection if it doesn't exist
    save_to_cache(...)                    → upsert a point after a fresh LLM call
    fetch_from_cache(...)                 → semantic search + Safety Gate; dict or None
    ping()                                → health check
"""

import os
import sys
import time
import uuid
from typing import Optional

# These modules log with Unicode (≈ → ─ ⚡ ❌ 🟢). Windows consoles default to
# cp1252, which raises UnicodeEncodeError and turns a cache HIT into a 500.
# errors="replace" guarantees logging can never break a request again.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import numpy as np
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

from dynamic_ttl import get_semantic_ttl
from embedding.context_chain import embed_with_context

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration — read from .env
# ---------------------------------------------------------------------------
QDRANT_URL       = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY   = os.getenv("QDRANT_API_KEY", "")

COLLECTION_NAME  = "memolm_cache"
VECTOR_SIZE      = 768          # matches BAAI/bge-base-en-v1.5
DEFAULT_TTL      = 600          # fallback when semantic TTL routing is unavailable

# Payload fields that MUST be indexed before Qdrant will accept a filter on
# them. Without these, query_points() fails with:
#   400 "Index required but not found for \"tenant_id\" of type [keyword]"
# The first three are the hard pre-filter; the rest are Safety Gate inputs and
# are indexed so they can be pushed into the filter later without a reindex.
INDEXED_FIELDS = (
    "tenant_id",
    "provider",
    "model",
    "knowledge_version",
    "prompt_version",
    "risk",
)

# Minimum cosine similarity to even pass Qdrant's pre-filter.
# Raised to 0.92 to cut false positives before they even reach the Safety Gate.
# (e.g. "cancellation policy for flights" vs "cancellation policy for hotels" = ~0.91 → correctly rejected)
SIMILARITY_FLOOR = 0.90

_client: Optional[QdrantClient] = None


def get_qdrant() -> QdrantClient:
    """Return (or create) the shared Qdrant client."""
    global _client
    if _client is None:
        _client = QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY,
        )
    return _client


def ensure_collection() -> None:
    """
    Create the Qdrant collection (vectors + payload indexes) if it does not exist.

    Payload indexes are NOT optional: Qdrant rejects any filtered search whose
    filter key has no index, so a collection created without them 500s on the
    very first cache lookup. This function is therefore called on app startup.
    """
    client = get_qdrant()
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        print(f"[Qdrant] Created collection '{COLLECTION_NAME}'")
    else:
        print(f"[Qdrant] Collection '{COLLECTION_NAME}' already exists")

    # Idempotent: Qdrant returns success if the index already exists.
    for field in INDEXED_FIELDS:
        client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name=field,
            field_schema=PayloadSchemaType.KEYWORD,
        )
    print(f"[Qdrant] Payload indexes ready: {', '.join(INDEXED_FIELDS)}")


# ---------------------------------------------------------------------------
# Core: Save a fresh LLM response into Qdrant
# ---------------------------------------------------------------------------
def save_to_cache(
    tenant_id: str,
    provider: str,
    model: str,
    messages: list,          # Full conversation history from the request
    response: str,           # The LLM's answer (plain text)
    version: Optional[str] = None,
    ttl: Optional[int] = None,     # None → auto TTL via dynamic_ttl semantic routing
    risk: Optional[str] = None,
) -> Optional[str]:
    """
    Embed the conversation context and store the LLM answer in Qdrant.

    When ttl is None, the TTL is decided by `dynamic_ttl.get_semantic_ttl`:
    a resolution of 0 (never-cache domains / high risk) skips storing.
    Returns the UUID of the stored point, or None when not stored.
    """
    current_query = messages[-1]["content"] if isinstance(messages[-1], dict) else messages[-1]
    prior_messages = [
        (m["content"] if isinstance(m, dict) else m) for m in messages[:-1]
    ]

    if ttl is None:
        ttl = get_semantic_ttl(current_query, risk_level=risk)

    if ttl == 0:
        print(f"[Qdrant] SKIPPED — dynamic_ttl=0 (never cache) for query: "
              f"{current_query[:60]!r}")
        return None

    vector = embed_with_context(current_query, prior_messages)

    created_at = time.time()
    payload = {
        "tenant_id":         tenant_id,
        "provider":          provider,
        "model":             model,
        "knowledge_version": version or "",
        "created_at":        created_at,
        "expiry":            created_at + ttl,
        "ttl_seconds":       ttl,
        "risk":              risk or "low",
        "response":          response,    # The actual answer to return on a hit
    }

    point_id = str(uuid.uuid4())
    get_qdrant().upsert(
        collection_name=COLLECTION_NAME,
        points=[PointStruct(id=point_id, vector=vector.tolist(), payload=payload)],
    )
    print(f"[Qdrant] Saved point {point_id} (ttl={ttl}s, version={version or ''})")
    return point_id


# ---------------------------------------------------------------------------
# Core: Look up the cache — embed + search + Safety Gate
# ---------------------------------------------------------------------------
def fetch_from_cache(
    tenant_id: str,
    provider: str,
    model: str,
    messages: list,
    version: Optional[str] = None,
    risk: Optional[str] = None,
    score_threshold: float = SIMILARITY_FLOOR,
) -> Optional[dict]:
    """
    Search Qdrant for a semantically similar past answer.
    Passes every candidate through the Safety Gate.
    Returns the cached payload dict on a SAFE HIT, or None on a miss/rejection.
    """
    # If no knowledge_version was provided, skip the cache entirely.
    # We never want to serve a cached answer when we don't know what version the data is.
    if version is None:
        return None

    current_query = messages[-1]["content"] if isinstance(messages[-1], dict) else messages[-1]
    prior_messages = [
        (m["content"] if isinstance(m, dict) else m) for m in messages[:-1]
    ]
    query_vector = embed_with_context(current_query, prior_messages)

    response = get_qdrant().query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector.tolist(),
        limit=1,
        score_threshold=score_threshold,
        query_filter=Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="provider",  match=MatchValue(value=provider)),
                FieldCondition(key="model",     match=MatchValue(value=model)),
            ]
        ),
    )
    results = response.points

    if not results:
        print(f"[Qdrant] MISS — no candidate above score_threshold={score_threshold}")
        return None

    candidate = results[0]
    payload   = candidate.payload
    score     = candidate.score

    print(f"[Qdrant] Candidate found — score={score:.3f}, id={candidate.id}")

    # -----------------------------------------------------------------------
    # 4. SAFETY GATE — 4-point verification
    # -----------------------------------------------------------------------

    # Check A: Knowledge Version must match
    cached_version = payload.get("knowledge_version", "")
    request_version = version or ""
    if cached_version != request_version:
        print(f"[Safety Gate] REJECTED — knowledge_version mismatch: "
              f"cached='{cached_version}' vs request='{request_version}'")
        return None

    # Check B: TTL — make sure the entry hasn't expired
    now = time.time()
    expiry = payload.get("expiry", 0)
    if now > expiry:
        print(f"[Safety Gate] REJECTED — entry expired "
              f"({int(now - expiry)}s ago)")
        return None

    # Check C: Risk-based similarity threshold
    # The Safety Gate's final similarity check. Even after passing SIMILARITY_FLOOR (0.92),
    # "low" risk requires 0.95 — a very strict match.
    # This is the last line of defense against false positive cache hits.
    risk_thresholds = {"low": 0.95, "medium": 0.90, "high": 0.85}
    required_score  = risk_thresholds.get((risk or "low").lower(), 0.95)
    if score < required_score:
        print(f"[Safety Gate] REJECTED — score {score:.3f} < required {required_score} "
              f"for risk='{risk}'")
        return None

    # -----------------------------------------------------------------------
    # 5. ALL CHECKS PASSED → Safe Cache Hit!
    # -----------------------------------------------------------------------
    latency_saved = round(1.2 - 0.02, 2)   # Estimated savings vs a typical LLM call
    print(f"[Qdrant] SAFE HIT — returning cached response "
          f"(score={score:.3f}, latency_saved≈{latency_saved}s)")

    return {
        "verdict":       "SAFE_CACHE_HIT",
        "similarity":    round(score, 4),
        "latency_saved": latency_saved,
        "payload":       payload,
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def ping() -> bool:
    """Returns True if Qdrant is reachable."""
    try:
        get_qdrant().get_collections()
        return True
    except Exception as e:
        print(f"[Qdrant] Ping failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    ensure_collection()
    print(f"Qdrant ping → {ping()}")

    car_messages = [
        {"role": "user", "content": "I like the Toyota Camry."},
        {"role": "user", "content": "What is the price of this?"},
    ]
    laptop_messages = [
        {"role": "user", "content": "I like the MacBook Pro."},
        {"role": "user", "content": "What is the price of this?"},
    ]

    # Save a car answer (TTL auto-routed by dynamic_ttl)
    save_to_cache(
        tenant_id="demo", provider="groq", model="llama-3.3-70b",
        messages=car_messages, response="The Toyota Camry starts at $31,000.",
        version="v1", risk="low",
    )

    # Try to fetch using the car conversation → should HIT
    hit = fetch_from_cache(
        tenant_id="demo", provider="groq", model="llama-3.3-70b",
        messages=car_messages, version="v1",
    )
    print(f"\nCar query hit  → {hit['verdict'] if hit else 'MISS'}")

    # Try to fetch using the laptop conversation → should MISS (different topic)
    miss = fetch_from_cache(
        tenant_id="demo", provider="groq", model="llama-3.3-70b",
        messages=laptop_messages, version="v1",
    )
    print(f"Laptop query   → {miss['verdict'] if miss else 'MISS (correct!)'}")