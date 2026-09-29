import json
import os
import sys
import time
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from groq import AsyncGroq
from dotenv import load_dotenv

import database.qdrant_store as cache
from dynamic_ttl import get_semantic_ttl

# Windows consoles default to cp1252 and cannot encode the Unicode used in the
# log lines below; a failed print would surface as a 500 on a healthy request.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

load_dotenv()

# Upstream model. Configurable because Groq model access is per-API-key: a key
# without access to the configured model fails with a 404 model_not_found.
# Verify yours with:  curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

app = FastAPI(title="MemoLM Gateway", version="1.0")


@app.on_event("startup")
async def initialize_cache() -> None:
    cache.ensure_collection()


# Initialize the Groq client (our fallback LLM)
groq_client = AsyncGroq()


async def stream_cached_response(cached_text: str) -> AsyncGenerator[str, None]:
    """
    Simulates a streaming LLM response (Server-Sent Events) from a cached string.
    This gives the frontend the exact same typing effect, but instantly.
    """
    chunk_size = 15  # Characters per chunk
    for i in range(0, len(cached_text), chunk_size):
        chunk = cached_text[i : i + chunk_size]
        
        # Format exactly like OpenAI/Groq SSE chunks
        data = {
            "id": "chatcmpl-memolm-cache",
            "object": "chat.completion.chunk",
            "choices": [{"delta": {"content": chunk}}],
        }
        yield f"data: {json.dumps(data)}\n\n"
        
        # Tiny delay to make it stream beautifully in the UI (but much faster than real LLMs)
        time.sleep(0.01) 
        
    yield "data: [DONE]\n\n"


@app.post("/openai/v1/chat/completions")
@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def chat_completions(request: Request):
    """
    Drop-in replacement for OpenAI/Groq API.
    Intercepts the request -> Checks Qdrant Cache -> Returns or forwards to Groq.
    """
    body = await request.json()
    
    messages = body.get("messages", [])
    model = body.get("model") or DEFAULT_MODEL
    stream = body.get("stream", False)

    # Groq gets the ENTIRE conversation so it fully understands what was said 20
    # turns ago — that is what gives correct answers.
    full_messages = messages            # full history → goes to Groq

    # MemoLM Custom Headers (for Safety Gate)
    tenant_id = request.headers.get("x-memolm-tenant", "default-tenant")

    # knowledge_version is REQUIRED.
    # Accepts either x-memolm-version or x-memolm-knowledge-version
    knowledge_version = (
        request.headers.get("x-memolm-version")
        or request.headers.get("x-memolm-knowledge-version")
    )
    if not knowledge_version:
        print("[MemoLM] WARNING: x-memolm-version header missing. Skipping cache.")
        knowledge_version = None

    # Risk level from request or defaults to "low"
    risk_level = request.headers.get("x-memolm-risk", "low").lower()

    # Per-request cache controls
    force_refresh = (
        request.headers.get("x-memolm-force-refresh", "").lower() in ("true", "1", "yes")
        or body.get("force_refresh", False)
    )
    cache_only = (
        request.headers.get("x-memolm-cache-only", "").lower() in ("true", "1", "yes")
        or body.get("cache_only", False)
    )
    similarity_threshold_raw = (
        request.headers.get("x-memolm-similarity-threshold")
        or body.get("similarity_threshold")
    )
    try:
        similarity_threshold = float(similarity_threshold_raw) if similarity_threshold_raw is not None else None
    except (ValueError, TypeError):
        similarity_threshold = None

    # -----------------------------------------------------------------------
    # 1. SEMANTIC CACHE LOOKUP  (user turns only, via the context chain)
    # -----------------------------------------------------------------------
    current_query, _ = cache.user_chain(messages)

    cached_result = None
    if not force_refresh and knowledge_version:
        cached_result = cache.fetch_from_cache(
            tenant_id=tenant_id,
            provider="groq",
            model=model,
            messages=messages,
            version=knowledge_version,
            risk=risk_level,
            similarity_threshold=similarity_threshold,
            return_rejection_details=True,
        )

    if cached_result and cached_result.get("verdict") == "SAFE_CACHE_HIT":
        # Cache HIT!
        cached_response = cached_result["payload"]["response"]
        print(f"⚡ CACHE HIT! Served in ~20ms")

        if stream:
            return StreamingResponse(
                stream_cached_response(cached_response),
                media_type="text/event-stream"
            )
        else:
            return JSONResponse({
                "id": "chatcmpl-memolm-cache",
                "object": "chat.completion",
                "choices": [{"message": {"role": "assistant", "content": cached_response}}],
                "memolm_stats": cached_result # Custom metadata for the frontend & SDK
            })

    if cache_only:
        # Client requested cache_only but no safe cache hit was found
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "message": "Cache miss and cache_only was requested.",
                    "type": "cache_miss"
                }
            }
        )

    # -----------------------------------------------------------------------
    # 2. CACHE MISS / SAFETY REJECTED -> CALL GROQ
    # -----------------------------------------------------------------------
    print(f"❌ CACHE MISS / SAFETY REJECTED. Routing to Groq...")

    # Calculate how long to cache this specific question.
    ttl = get_semantic_ttl(current_query, risk_level=risk_level) if current_query else 0

    if not stream:
        # NON-STREAMING FALLBACK
        t0 = time.time()
        try:
            chat_completion = await groq_client.chat.completions.create(
                messages=full_messages,
                model=model,
            )
        except Exception as exc:
            print(f"[Groq] UPSTREAM ERROR ({type(exc).__name__}): {exc}")
            return JSONResponse(
                status_code=502,
                content={"error": {"message": f"Upstream provider error: {exc}", "type": "upstream_error"}},
            )

        latency_ms = round((time.time() - t0) * 1000, 2)
        llm_answer = chat_completion.choices[0].message.content

        if ttl > 0:
            cache.save_to_cache(
                tenant_id, "groq", model, messages, llm_answer,
                version=knowledge_version, ttl=ttl, risk=risk_level
            )

        res_data = chat_completion.model_dump()
        if cached_result and cached_result.get("verdict") == "SAFETY_REJECTED":
            res_data["memolm_stats"] = {
                "verdict": "SAFETY_REJECTED",
                "similarity": cached_result.get("similarity", 0.0),
                "rejection_reasons": cached_result.get("rejection_reasons", []),
                "latency_ms": latency_ms,
                "cost_incurred": 0.005,
                "payload": None,
            }
        else:
            res_data["memolm_stats"] = {
                "verdict": "CACHE_MISS",
                "similarity": 0.0,
                "latency_ms": latency_ms,
                "cost_incurred": 0.005,
                "payload": None,
            }
        return JSONResponse(res_data)


    # -----------------------------------------------------------------------
    # 3. STREAMING FALLBACK (Server-Sent Events)
    # -----------------------------------------------------------------------
    async def stream_from_llm():
        # full_messages → Groq needs the entire history to give a correct, contextual answer
        try:
            chat_stream = await groq_client.chat.completions.create(
                messages=full_messages,
                model=model,
                stream=True,
            )
        except Exception as exc:
            # The response has already started, so the status code is locked in.
            # Emit a terminal error frame the client can detect, then close cleanly
            # instead of tearing down the ASGI task with a traceback.
            print(f"[Groq] UPSTREAM ERROR ({type(exc).__name__}): {exc}")
            yield f"data: {json.dumps({'error': {'message': f'Upstream provider error: {exc}', 'type': 'upstream_error'}})}\n\n"
            yield "data: [DONE]\n\n"
            return

        accumulated_answer = ""

        async for chunk in chat_stream:
            # Yield the chunk directly to the user
            yield f"data: {chunk.model_dump_json()}\n\n"

            # Save the chunk so we can cache the full answer at the end
            if chunk.choices[0].delta.content is not None:
                accumulated_answer += chunk.choices[0].delta.content

        yield "data: [DONE]\n\n"

        # After the stream finishes, save to Qdrant (user turns only)
        if ttl > 0 and accumulated_answer.strip():
            cache.save_to_cache(
                tenant_id, "groq", model, messages, accumulated_answer,
                version=knowledge_version, ttl=ttl, risk=risk_level
            )

    return StreamingResponse(stream_from_llm(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# 4. ACTIVE CACHE MANAGEMENT APIS
# ---------------------------------------------------------------------------

@app.post("/cache/invalidate")
async def invalidate_cache_endpoint(request: Request):
    """
    Explicitly invalidate cached answers by tenant and/or knowledge version.
    """
    body = {}
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = await request.json()
        except Exception:
            body = {}

    tenant_id = body.get("tenant_id") or request.headers.get("x-memolm-tenant")
    version = body.get("version") or request.headers.get("x-memolm-version")

    count = cache.invalidate_cache(tenant_id=tenant_id, version=version)
    return JSONResponse({
        "status": "ok",
        "message": "Cache invalidated successfully",
        "deleted_count": count,
        "tenant_id": tenant_id,
        "version": version,
    })


@app.post("/cache/inspect")
async def inspect_cache_endpoint(request: Request):
    """
    Dry-run a query against Qdrant to inspect what would hit, cosine similarity,
    and whether the Safety Gate would pass or reject, without billing an LLM call.
    """
    body = {}
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = await request.json()
        except Exception:
            body = {}

    query = body.get("query")
    messages = body.get("messages")
    tenant_id = body.get("tenant_id") or request.headers.get("x-memolm-tenant", "default-tenant")
    version = body.get("version") or request.headers.get("x-memolm-version")
    risk = body.get("risk") or request.headers.get("x-memolm-risk", "low")
    similarity_threshold = body.get("similarity_threshold")
    if similarity_threshold is not None:
        try:
            similarity_threshold = float(similarity_threshold)
        except (ValueError, TypeError):
            similarity_threshold = None

    result = cache.inspect_cache(
        query=query,
        messages=messages,
        tenant_id=tenant_id,
        version=version,
        risk=risk,
        similarity_threshold=similarity_threshold,
    )
    return JSONResponse(result)


@app.post("/cache/seed")
async def seed_cache_endpoint(request: Request):
    """
    Bulk warm-up known documentation or FAQ entries directly into the vector store.
    """
    body = {}
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = await request.json()
        except Exception:
            body = {}

    items = body.get("items", [])
    seeded_count = cache.seed_cache(items)
    return JSONResponse({
        "status": "ok",
        "seeded_count": seeded_count,
    })


if __name__ == "__main__":
    import uvicorn
    # Start the server!
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

