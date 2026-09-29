import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoLM } from "../src/client";
import { wrapOpenAI } from "../src/wrapper";

function makeJsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("wrapOpenAI", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routes through MemoLM gateway and attaches stats", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        id: "chatcmpl-cached",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "cached answer" }, finish_reason: "stop" }],
        memolm_stats: { verdict: "SAFE_CACHE_HIT", similarity: 0.98, latency_saved: 1100 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const mockOpenAI = {
      apiKey: "sk-openai",
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    const wrapped = wrapOpenAI(mockOpenAI as any, {
      gatewayURL: "http://localhost:8000",
      defaultKnowledgeVersion: "v12",
    });

    const res = await wrapped.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(res.choices[0].message.content).toBe("cached answer");
    expect(res.memolm_stats?.verdict).toBe("SAFE_CACHE_HIT");

    const metrics = wrapped.getSessionMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.hitRatePct).toBe(100);
  });

  it("fails open to original client when gateway is unreachable", async () => {
    // fetch throws connection error
    const fetchMock = vi.fn().mockRejectedValue(new Error("Connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const originalCreate = vi.fn().mockResolvedValue({
      id: "chatcmpl-direct",
      choices: [{ message: { content: "direct response" } }],
    });

    const mockOpenAI = {
      apiKey: "sk-openai",
      chat: {
        completions: {
          create: originalCreate,
        },
      },
    };

    const wrapped = wrapOpenAI(mockOpenAI as any, {
      gatewayURL: "http://localhost:8000",
      fallbackToUpstream: true,
      maxRetries: 0,
    });

    const res = await wrapped.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello" }],
      knowledgeVersion: "v12",
    });

    expect(originalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hello" }],
      })
    );
    expect(res.choices[0].message.content).toBe("direct response");
  });
});

describe("per-request flags and telemetry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends forceRefresh, cacheOnly, and similarityThreshold in headers", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      capturedHeaders = new Headers(init.headers);
      return Promise.resolve(
        makeJsonResponse({
          id: "fresh",
          choices: [{ message: { role: "assistant", content: "fresh" } }],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 0 });
    await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      forceRefresh: true,
      cacheOnly: false,
      similarityThreshold: 0.96,
    });

    expect(capturedHeaders?.get("x-memolm-force-refresh")).toBe("true");
    expect(capturedHeaders?.get("x-memolm-similarity-threshold")).toBe("0.96");
  });

  it("triggers onCacheHit and onCacheMiss callbacks and records metrics", async () => {
    let hitStats: any = null;
    let missStats: any = null;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse({
          id: "hit",
          choices: [{ message: { content: "hit" } }],
          memolm_stats: { verdict: "SAFE_CACHE_HIT", similarity: 0.99, latency_saved: 1200 },
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          id: "miss",
          choices: [{ message: { content: "miss" } }],
          memolm_stats: { verdict: "CACHE_MISS", similarity: 0.0 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({
      maxRetries: 0,
      onCacheHit: (stats) => { hitStats = stats; },
      onCacheMiss: (stats) => { missStats = stats; },
    });

    await client.chat.completions.create({ messages: [{ role: "user", content: "query 1" }] });
    await client.chat.completions.create({ messages: [{ role: "user", content: "query 2" }] });

    expect(hitStats).not.toBeNull();
    expect(hitStats.similarity).toBe(0.99);
    expect(missStats).not.toBeNull();
    expect(missStats.verdict).toBe("CACHE_MISS");

    const metrics = client.getSessionMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.hitRatePct).toBe(50);
  });
});
