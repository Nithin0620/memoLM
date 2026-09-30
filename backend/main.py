import json
import os
import sys
import time
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv

import database.qdrant_store as cache
from dynamic_ttl import get_semantic_ttl, contains_personal_data
from provider import (
    ProviderError,
    ProviderNotConfigured,
    ProviderNotFound,
    list_providers,
    resolve_provider,
)

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

load_dotenv()

DEFAULT_PROVIDER = (os.getenv("MEMOLM_DEFAULT_PROVIDER") or "groq").strip().lower()

app = FastAPI(title="MemoLM Gateway", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def initialize_cache() -> None:
    cache.ensure_collection()

async def stream_cached_response(cached_text: str) -> AsyncGenerator[str, None]:
    chunk_size = 15
    for i in range(0, len(cached_text), chunk_size):
        chunk = cached_text[i : i + chunk_size]
        data = {
            "id": "chatcmpl-memolm-cache",
            "object": "chat.completion.chunk",
            "choices": [{"delta": {"content": chunk}}],
        }
        yield f"data: {json.dumps(data)}\n\n"
        time.sleep(0.01)
    yield "data: [DONE]\n\n"

@app.post("/openai/v1/chat/completions")
@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    stream = body.get("stream", False)

    auth_header = request.headers.get("authorization", "")
    client_api_key = None
    if auth_header.lower().startswith("bearer "):
        client_api_key = auth_header[7:].strip()
    client_api_key = client_api_key or request.headers.get("x-memolm-api-key") or body.get("api_key")
    client_base_url = request.headers.get("x-memolm-base-url") or body.get("base_url")

    requested_provider = request.headers.get("x-memolm-provider") or body.get("provider")
    try:
        provider = resolve_provider(requested_provider, DEFAULT_PROVIDER)
    except (ProviderNotFound, ProviderNotConfigured, ProviderError) as exc:
        print(f"[MemoLM] REJECTED provider routing: {exc}")
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "message": str(exc),
                    "type": "provider_unavailable",
                    "available_providers": list_providers(),
                }
            },
        )

    model = body.get("model") or provider.config.model
    temperature = body.get("temperature")
    if temperature is not None:
        try:
            temperature = float(temperature)
        except (ValueError, TypeError):
            temperature = None
    max_tokens = body.get("max_tokens")
    if max_tokens is not None:
        try:
            max_tokens = int(max_tokens)
        except (ValueError, TypeError):
            max_tokens = None

    full_messages = messages
    tenant_id = request.headers.get("x-memolm-tenant", "default-tenant")

    knowledge_version = (
        request.headers.get("x-memolm-version")
        or request.headers.get("x-memolm-knowledge-version")
    )
    if not knowledge_version:
        print("[MemoLM] WARNING: x-memolm-version header missing. Skipping cache.")
        knowledge_version = None

    risk_level = request.headers.get("x-memolm-risk", "low").lower()

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

    current_query, prior_user_turns = cache.user_chain(messages)
    is_personal = contains_personal_data(current_query, prior_user_turns)

    cached_result = None
    if not force_refresh and knowledge_version and not is_personal:
        cached_result = cache.fetch_from_cache(
            tenant_id=tenant_id,
            provider=provider.name,
            model=model,
            messages=messages,
            version=knowledge_version,
            risk=risk_level,
            similarity_threshold=similarity_threshold,
            return_rejection_details=True,
        )
    elif is_personal:
        print("[MemoLM] Personal-data query — bypassing cache entirely.")

    if cached_result and cached_result.get("verdict") == "SAFE_CACHE_HIT":
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
                "memolm_stats": cached_result
            })

    if cache_only:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "message": "Cache miss and cache_only was requested.",
                    "type": "cache_miss"
                }
            }
        )

    print(f"❌ CACHE MISS / SAFETY REJECTED. Routing to {provider.name}...")
    ttl = get_semantic_ttl(current_query, risk_level=risk_level) if current_query else 0

    if not stream:
        t0 = time.time()
        try:
            res_data = await provider.complete(
                model=model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                api_key=client_api_key,
                base_url=client_base_url,
            )
        except Exception as exc:
            print(f"[{provider.name}] UPSTREAM ERROR ({type(exc).__name__}): {exc}")
            return JSONResponse(
                status_code=502,
                content={
                    "error": {
                        "message": f"Upstream provider '{provider.name}' error: {type(exc).__name__}",
                        "type": "upstream_error",
                        "provider": provider.name,
                    }
                },
            )

        latency_ms = round((time.time() - t0) * 1000, 2)
        llm_answer = res_data["choices"][0]["message"]["content"]

        if ttl > 0:
            cache.save_to_cache(
                tenant_id, provider.name, model, messages, llm_answer,
                version=knowledge_version, ttl=ttl, risk=risk_level
            )

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

    async def stream_from_llm():
        accumulated_answer = ""
        try:
            async for chunk in provider.stream(
                model=model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                api_key=client_api_key,
                base_url=client_base_url,
            ):
                text = chunk["choices"][0]["delta"].get("content")
                if not text:
                    continue
                yield f"data: {json.dumps(chunk)}\n\n"
                accumulated_answer += text
        except Exception as exc:
            print(f"[{provider.name}] UPSTREAM ERROR ({type(exc).__name__}): {exc}")
            yield f"data: {json.dumps({'error': {'message': f'Upstream provider error: {type(exc).__name__}', 'type': 'upstream_error', 'provider': provider.name}})}\n\n"
            yield "data: [DONE]\n\n"
            return

        yield "data: [DONE]\n\n"
        if ttl > 0 and accumulated_answer.strip():
            cache.save_to_cache(
                tenant_id, provider.name, model, messages, accumulated_answer,
                version=knowledge_version, ttl=ttl, risk=risk_level
            )

    return StreamingResponse(stream_from_llm(), media_type="text/event-stream")

@app.post("/cache/invalidate")
async def invalidate_cache_endpoint(request: Request):
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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
