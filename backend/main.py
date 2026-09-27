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
    #
    # The cache layer receives the same array but keeps only user turns; see
    # `qdrant_store.user_chain`. It used to be pre-sliced to `messages[-10:]`
    # here, which kept the last 10 *mixed-role* messages and so handed the role
    # filter a set already truncated by assistant prose. The context chain caps
    # how far back it reads, so no pre-slice is needed.
    full_messages = messages            # full history → goes to Groq

    # MemoLM Custom Headers (for Safety Gate)
    tenant_id = request.headers.get("x-memolm-tenant", "default-tenant")

    # knowledge_version is REQUIRED. We do not default to "v1" anymore.
    # If the client forgets to send it, we reject the cache lookup entirely
    # and always go to the LLM. This prevents stale cache hits when business
    # data changes — the client MUST explicitly send the current version.
    knowledge_version = request.headers.get("x-memolm-version")
    if not knowledge_version:
        # No version header → skip cache entirely, go straight to LLM
        print("[MemoLM] WARNING: x-memolm-version header missing. Skipping cache.")
        knowledge_version = None  # signals fetch_from_cache to return None immediately

    # Risk level is hardcoded to "low" — always require high similarity (≥ 0.95) before serving cache
    risk_level = "low"

    # -----------------------------------------------------------------------
    # 1. SEMANTIC CACHE LOOKUP  (user turns only, via the context chain)
    # -----------------------------------------------------------------------
    # The query the TTL router scores. Derived from user turns for the same
    # reason the cache embeds only user turns: an assistant message must never
    # become the thing we key TTL and retrieval off.
    current_query, _ = cache.user_chain(messages)

    cached_result = cache.fetch_from_cache(
        tenant_id=tenant_id,
        provider="groq",
        model=model,
        messages=messages,
        version=knowledge_version,
        risk=risk_level
    )

    if cached_result:
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
                "memolm_stats": cached_result # Custom metadata for the frontend
            })

    # -----------------------------------------------------------------------
    # 2. CACHE MISS -> CALL GROQ
    # -----------------------------------------------------------------------
    print(f"❌ CACHE MISS. Routing to Groq...")
    
    # Calculate how long to cache this specific question.
    # No usable user turn (empty or multimodal-only request) → ttl 0, so the
    # answer is served but never written to the cache.
    ttl = get_semantic_ttl(current_query, risk_level=risk_level) if current_query else 0

    if not stream:
        # NON-STREAMING FALLBACK
        # full_messages → Groq needs the entire history to give a correct, contextual answer
        try:
            chat_completion = await groq_client.chat.completions.create(
                messages=full_messages,
                model=model,
            )
        except Exception as exc:
            # An upstream failure (bad model name, revoked key, rate limit) must
            # not surface as an unhandled ASGI traceback. Cache stays valid, so
            # the next request can still be served from it.
            print(f"[Groq] UPSTREAM ERROR ({type(exc).__name__}): {exc}")
            return JSONResponse(
                status_code=502,
                content={"error": {"message": f"Upstream provider error: {exc}", "type": "upstream_error"}},
            )

        llm_answer = chat_completion.choices[0].message.content

        if ttl > 0:
            # Only user turns are stored; qdrant_store.user_chain applies the filter
            cache.save_to_cache(
                tenant_id, "groq", model, messages, llm_answer,
                version=knowledge_version, ttl=ttl, risk=risk_level
            )

        return chat_completion.model_dump()


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

if __name__ == "__main__":
    import uvicorn
    # Start the server!
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

