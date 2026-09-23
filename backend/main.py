import json
import time
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from groq import AsyncGroq
from dotenv import load_dotenv

import database.qdrant_store as cache
from dynamic_ttl import get_semantic_ttl

load_dotenv()

app = FastAPI(title="MemoLM Gateway", version="1.0")

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


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """
    Drop-in replacement for OpenAI/Groq API.
    Intercepts the request -> Checks Qdrant Cache -> Returns or forwards to Groq.
    """
    body = await request.json()
    
    messages = body.get("messages", [])
    model = body.get("model", "llama-3.3-70b-versatile")
    stream = body.get("stream", False)

    # We keep TWO versions of the message history:
    #
    # 1. full_messages  → sent to Groq (the real LLM).
    #                     Groq needs the ENTIRE conversation so it fully understands
    #                     what was said 20 turns ago. This is what gives correct answers.
    #
    # 2. cache_messages → used for Qdrant embedding ONLY (last 5 messages).
    #                     We only need recent context to build a meaningful search vector.
    #                     Sending 50 turns to the embedding model dilutes the vector
    #                     and wastes time. 5 is always enough for context.
    full_messages  = messages            # full history → goes to Groq
    cache_messages = messages[-10:]      # last 10 only  → goes to Qdrant

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
    # 1. SEMANTIC CACHE LOOKUP  (uses cache_messages — last 5 only)
    # -----------------------------------------------------------------------
    # We grab the latest question from the messages
    current_query = cache_messages[-1].get("content", "") if isinstance(cache_messages[-1], dict) else cache_messages[-1]

    cached_result = cache.fetch_from_cache(
        tenant_id=tenant_id,
        provider="groq",
        model=model,
        messages=cache_messages,
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
    
    # Calculate how long to cache this specific question
    ttl = get_semantic_ttl(current_query, risk_level=risk_level)

    if not stream:
        # NON-STREAMING FALLBACK
        # full_messages → Groq needs the entire history to give a correct, contextual answer
        chat_completion = await groq_client.chat.completions.create(
            messages=full_messages,
            model=model,
        )
        llm_answer = chat_completion.choices[0].message.content

        if ttl > 0:
            # cache_messages (last 5) → we only store recent context in the Qdrant vector
            cache.save_to_cache(
                tenant_id, "groq", model, cache_messages, llm_answer,
                version=knowledge_version, ttl=ttl, risk=risk_level
            )

        return chat_completion.model_dump()


    # -----------------------------------------------------------------------
    # 3. STREAMING FALLBACK (Server-Sent Events)
    # -----------------------------------------------------------------------
    async def stream_from_llm():
        # full_messages → Groq needs the entire history to give a correct, contextual answer
        chat_stream = await groq_client.chat.completions.create(
            messages=full_messages,
            model=model,
            stream=True,
        )

        accumulated_answer = ""

        async for chunk in chat_stream:
            # Yield the chunk directly to the user
            yield f"data: {chunk.model_dump_json()}\n\n"

            # Save the chunk so we can cache the full answer at the end
            if chunk.choices[0].delta.content is not None:
                accumulated_answer += chunk.choices[0].delta.content

        yield "data: [DONE]\n\n"

        # After the stream finishes, save to Qdrant using cache_messages (last 5 only)
        if ttl > 0 and accumulated_answer.strip():
            cache.save_to_cache(
                tenant_id, "groq", model, cache_messages, accumulated_answer,
                version=knowledge_version, ttl=ttl, risk=risk_level
            )

    return StreamingResponse(stream_from_llm(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # Start the server!
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

