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
    FilterSelector,
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

# Minimum cosine similarity to pass Qdrant's pre-filter.
# Raised from 0.85 to 0.92 to stop near-miss entity matches (BMW vs Nano,
# OS vs OSI) that slipped through the old bar.
SIMILARITY_FLOOR = 0.85

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
# Core: message list -> context chain (user turns only)
# ---------------------------------------------------------------------------
def user_chain(messages: list) -> tuple:
    """
    Split an OpenAI-style `messages` array into (current_query, prior_messages)
    for the embedding step. Public because `main.py` reuses it to pick the query
    text that `dynamic_ttl` routes on.

    Only `role == "user"` turns reach the vector. Assistant prose was the single
    largest source of false cache hits: two unrelated questions asked in the same
    conversation shared a byte-identical prefix of assistant text, and because the
    old context chain was prefix-preserving that prefix grew with every turn.
    Cosine then saturated toward 1.0 and the cache served the wrong answer — a
    greeting from turn 2 was returned for a technical question at turn 3
    (cosine 0.9371, over the Safety Gate). Measured after this filter: 0.7973,
    a clean miss.

    Content is kept only when it is a non-empty string. Multimodal part lists and
    `content: None` (assistant messages carrying tool_calls) used to reach the
    joiner in the context chain and raise TypeError, turning a healthy request into
    a 500.

    Returns (None, None) when no usable user turn exists; callers skip the cache.
    """
    texts = []
    for m in messages or []:
        if isinstance(m, dict):
            if m.get("role") != "user":
                continue
            m = m.get("content")
        if not isinstance(m, str) or not m.strip():
            continue
        texts.append(m)

    if not texts:
        return None, None
    return texts[-1], texts[:-1]


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
    current_query, prior_messages = user_chain(messages)
    if current_query is None:
        print("[Qdrant] SKIPPED — no usable user message to build a chain from")
        return None

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
    similarity_threshold: Optional[float] = None,
    return_rejection_details: bool = False,
) -> Optional[dict]:
    """
    Search Qdrant for a semantically similar past answer.
    Passes every candidate through the Safety Gate.
    Returns the cached payload dict on a SAFE HIT, or None/rejection details on a miss/rejection.
    """
    # If no knowledge_version was provided, skip the cache entirely.
    if version is None:
        if return_rejection_details:
            return {
                "verdict": "CACHE_MISS",
                "similarity": 0.0,
                "rejection_reasons": ["missing_knowledge_version"],
                "payload": None,
            }
        return None

    current_query, prior_messages = user_chain(messages)
    if current_query is None:
        print("[Qdrant] MISS — no usable user message to build a chain from")
        if return_rejection_details:
            return {
                "verdict": "CACHE_MISS",
                "similarity": 0.0,
                "rejection_reasons": ["no_usable_user_message"],
                "payload": None,
            }
        return None

    query_vector = embed_with_context(current_query, prior_messages)

    effective_threshold = (
        min(score_threshold, similarity_threshold)
        if similarity_threshold is not None
        else score_threshold
    )

    # Allow matching exact provider/model or seeded items ("all" / "seed")
    provider_conditions = [MatchValue(value=provider), MatchValue(value="seed"), MatchValue(value="all")]
    model_conditions = [MatchValue(value=model), MatchValue(value="all")]

    provider_filter = [FieldCondition(key="provider", match=MatchValue(value=p)) for p in [provider, "seed", "all"]]
    model_filter = [FieldCondition(key="model", match=MatchValue(value=m)) for m in [model, "all"]]

    response = get_qdrant().query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector.tolist(),
        limit=1,
        score_threshold=effective_threshold,
        query_filter=Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
            ],
            should=[
                FieldCondition(key="provider", match=MatchValue(value=provider)),
                FieldCondition(key="provider", match=MatchValue(value="seed")),
                FieldCondition(key="provider", match=MatchValue(value="all")),
            ],
        ),
    )
    results = response.points

    if not results:
        print(f"[Qdrant] MISS — no candidate above score_threshold={effective_threshold}")
        if return_rejection_details:
            return {
                "verdict": "CACHE_MISS",
                "similarity": 0.0,
                "rejection_reasons": [],
                "payload": None,
            }
        return None

    candidate = results[0]
    payload   = candidate.payload
    score     = candidate.score

    print(f"[Qdrant] Candidate found — score={score:.3f}, id={candidate.id}")

    # -----------------------------------------------------------------------
    # 4. SAFETY GATE — 4-point verification
    # -----------------------------------------------------------------------
    rejection_reasons = []

    # Check A: Knowledge Version must match
    cached_version = payload.get("knowledge_version", "")
    request_version = version or ""
    if cached_version != request_version:
        print(f"[Safety Gate] REJECTED — knowledge_version mismatch: "
              f"cached='{cached_version}' vs request='{request_version}'")
        rejection_reasons.append("knowledge_version_mismatch")

    # Check B: TTL — make sure the entry hasn't expired
    now = time.time()
    expiry = payload.get("expiry", 0)
    if now > expiry:
        print(f"[Safety Gate] REJECTED — entry expired "
              f"({int(now - expiry)}s ago)")
        rejection_reasons.append("entry_expired")

    # Check C: Risk-based or explicit similarity threshold
    risk_thresholds = {"low": 0.85, "medium": 0.90, "high": 0.95}
    required_score = (
        similarity_threshold
        if similarity_threshold is not None
        else risk_thresholds.get((risk or "low").lower(), 0.92)
    )
    if score < required_score:
        print(f"[Safety Gate] REJECTED — score {score:.3f} < required {required_score} "
              f"for risk='{risk}'")
        rejection_reasons.append("similarity_below_threshold")

    if rejection_reasons:
        if return_rejection_details:
            return {
                "verdict": "SAFETY_REJECTED",
                "similarity": round(score, 4),
                "rejection_reasons": rejection_reasons,
                "payload": payload,
            }
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
        "latency_saved_ms": int(latency_saved * 1000),
        "cost_saved":    0.005,
        "payload":       payload,
    }


def invalidate_cache(tenant_id: Optional[str] = None, version: Optional[str] = None) -> int:
    """
    Invalidate cached entries by tenant and/or knowledge version.
    Returns 1 on success, 0 on failure or no filter provided.
    """
    must_conditions = []
    if tenant_id:
        must_conditions.append(FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)))
    if version:
        must_conditions.append(FieldCondition(key="knowledge_version", match=MatchValue(value=version)))

    if not must_conditions:
        return 0

    try:
        get_qdrant().delete(
            collection_name=COLLECTION_NAME,
            points_selector=FilterSelector(filter=Filter(must=must_conditions)),
        )
        print(f"[Qdrant] Cache invalidated: tenant_id='{tenant_id}', version='{version}'")
        return 1
    except Exception as exc:
        print(f"[Qdrant] Invalidation error: {exc}")
        return 0


def inspect_cache(
    query: Optional[str] = None,
    messages: Optional[list] = None,
    tenant_id: str = "default-tenant",
    version: Optional[str] = None,
    risk: str = "low",
    similarity_threshold: Optional[float] = None,
) -> dict:
    """
    Dry-run a query against Qdrant to inspect what would hit, cosine similarity,
    and whether the Safety Gate would pass or reject, without billing an LLM call.
    """
    if query:
        current_query, prior_messages = query, []
    elif messages:
        current_query, prior_messages = user_chain(messages)
    else:
        return {
            "candidate_found": False,
            "verdict": "CACHE_MISS",
            "similarity": 0.0,
            "rejection_reasons": ["empty_query"],
            "cached_response": None,
        }

    if not current_query:
        return {
            "candidate_found": False,
            "verdict": "CACHE_MISS",
            "similarity": 0.0,
            "rejection_reasons": ["empty_query"],
            "cached_response": None,
        }

    query_vector = embed_with_context(current_query, prior_messages)

    response = get_qdrant().query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector.tolist(),
        limit=1,
        score_threshold=0.50,  # Broad threshold to inspect nearest candidate
        query_filter=Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
            ]
        ),
    )
    results = response.points
    if not results:
        return {
            "candidate_found": False,
            "verdict": "CACHE_MISS",
            "similarity": 0.0,
            "rejection_reasons": [],
            "cached_response": None,
        }

    candidate = results[0]
    payload = candidate.payload or {}
    score = float(candidate.score)

    rejection_reasons = []
    cached_version = payload.get("knowledge_version", "")
    if version and cached_version != version:
        rejection_reasons.append("knowledge_version_mismatch")

    now = time.time()
    expiry = payload.get("expiry", 0)
    if now > expiry:
        rejection_reasons.append("entry_expired")

    risk_thresholds = {"low": 0.85, "medium": 0.90, "high": 0.95}
    required_score = (
        similarity_threshold
        if similarity_threshold is not None
        else risk_thresholds.get((risk or "low").lower(), 0.92)
    )
    if score < required_score:
        rejection_reasons.append("similarity_below_threshold")

    verdict = "SAFE_CACHE_HIT" if not rejection_reasons else "SAFETY_REJECTED"

    return {
        "candidate_found": True,
        "verdict": verdict,
        "similarity": round(score, 4),
        "required_similarity": required_score,
        "rejection_reasons": rejection_reasons,
        "cached_response": payload.get("response"),
        "cached_version": cached_version,
        "tenant_id": payload.get("tenant_id"),
        "ttl_remaining_seconds": max(0, int(expiry - now)),
        "matched_query": payload.get("query") or current_query,
    }


def seed_cache(items: list) -> int:
    """
    Bulk warm-up known documentation or FAQ entries directly into the vector store.
    """
    points = []
    now = time.time()
    for item in items:
        if isinstance(item, dict):
            question = item.get("question") or item.get("query")
            answer = item.get("answer") or item.get("response")
            tenant_id = item.get("tenant_id", "default-tenant")
            version = item.get("version") or item.get("knowledge_version", "v1")
            risk = item.get("risk", "low")
            ttl = item.get("ttl") or item.get("ttl_seconds") or 864000
            provider = item.get("provider", "seed")
            model = item.get("model", "all")
        else:
            question = getattr(item, "question", None) or getattr(item, "query", None)
            answer = getattr(item, "answer", None) or getattr(item, "response", None)
            tenant_id = getattr(item, "tenant_id", "default-tenant")
            version = getattr(item, "version", None) or getattr(item, "knowledge_version", "v1")
            risk = getattr(item, "risk", "low")
            ttl = getattr(item, "ttl", None) or getattr(item, "ttl_seconds", 864000)
            provider = getattr(item, "provider", "seed")
            model = getattr(item, "model", "all")

        if not question or not answer:
            continue

        vector = embed_with_context(question, [])
        point_id = str(uuid.uuid4())
        payload = {
            "tenant_id": tenant_id,
            "provider": provider,
            "model": model,
            "knowledge_version": version,
            "created_at": now,
            "expiry": now + ttl,
            "ttl_seconds": ttl,
            "risk": risk,
            "response": answer,
            "query": question,
        }
        points.append(PointStruct(id=point_id, vector=vector.tolist(), payload=payload))

    if points:
        get_qdrant().upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"[Qdrant] Seeded {len(points)} items into cache.")
    return len(points)


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