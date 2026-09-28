import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoLM } from "../src/client";
import {
  MemoLMError,
  UpstreamProviderError,
  SafetyGateRejectionError,
  GatewayUnavailableError,
} from "../src/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeChatResponse(content = "Hello!", extra: Record<string, unknown> = {}): Response {
  return makeJsonResponse({
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

describe("MemoLM constructor", () => {
  it("applies defaults", () => {
    const client = new MemoLM();
    expect(client.baseURL).toBe("http://localhost:8000");
    expect(client.apiKey).toBe("memo-key");
    expect(client.defaultTenant).toBe("default-tenant");
    expect(client.defaultKnowledgeVersion).toBe("v1");
    expect(client.defaultRisk).toBe("low");
    expect(client.maxRetries).toBe(2);
  });

  it("strips trailing slashes from baseURL", () => {
    const client = new MemoLM({ baseURL: "http://example.com///" });
    expect(client.baseURL).toBe("http://example.com");
  });

  it("accepts custom config", () => {
    const client = new MemoLM({
      baseURL: "https://gateway.example.com",
      apiKey: "sk-test",
      defaultTenant: "acme",
      defaultKnowledgeVersion: "v5",
      defaultRisk: "high",
      maxRetries: 0,
    });
    expect(client.apiKey).toBe("sk-test");
    expect(client.defaultTenant).toBe("acme");
    expect(client.maxRetries).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Endpoint resolution
// ---------------------------------------------------------------------------

describe("endpoint resolution", () => {
  it("appends /openai/v1/chat/completions for bare base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ baseURL: "http://localhost:8000", maxRetries: 0 });
    await client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/openai/v1/chat/completions",
      expect.any(Object)
    );
    vi.unstubAllGlobals();
  });

  it("appends /chat/completions when baseURL ends with /v1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ baseURL: "http://localhost:8000/v1", maxRetries: 0 });
    await client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/v1/chat/completions",
      expect.any(Object)
    );
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Header correctness
// ---------------------------------------------------------------------------

describe("request headers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends all required MemoLM headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({
      apiKey: "sk-abc",
      defaultTenant: "tenant-a",
      defaultKnowledgeVersion: "v3",
      defaultRisk: "medium",
      maxRetries: 0,
    });

    await client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;

    expect(headers["Authorization"]).toBe("Bearer sk-abc");
    expect(headers["x-memolm-tenant"]).toBe("tenant-a");
    // Both header names must be present (parity with Python SDK)
    expect(headers["x-memolm-version"]).toBe("v3");
    expect(headers["x-memolm-knowledge-version"]).toBe("v3");
    expect(headers["x-memolm-risk"]).toBe("medium");
  });

  it("per-request params override client defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 0 });

    await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      knowledgeVersion: "v99",
      tenantId: "override-tenant",
      risk: "high",
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;

    expect(headers["x-memolm-knowledge-version"]).toBe("v99");
    expect(headers["x-memolm-tenant"]).toBe("override-tenant");
    expect(headers["x-memolm-risk"]).toBe("high");
  });

  it("sends x-memolm-ttl when ttlSeconds is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 0 });
    await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      ttlSeconds: 300,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["x-memolm-ttl"]).toBe("300");
    vi.unstubAllGlobals();
  });

  it("merges defaultHeaders with per-request extraHeaders", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({
      defaultHeaders: { "x-custom-default": "yes" },
      maxRetries: 0,
    });

    await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      extraHeaders: { "x-request-specific": "also-yes" },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-custom-default"]).toBe("yes");
    expect(headers["x-request-specific"]).toBe("also-yes");
  });
});

// ---------------------------------------------------------------------------
// Successful non-streaming response
// ---------------------------------------------------------------------------

describe("non-streaming completions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a ChatCompletion with content and memolm_stats", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeChatResponse("A refund takes 3-5 days.", {
        memolm_stats: {
          verdict: "SAFE_CACHE_HIT",
          similarity: 0.97,
          latency_saved: 1100,
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 0 });
    const res = await client.chat.completions.create({
      messages: [{ role: "user", content: "refund?" }],
    });

    expect(res.choices[0].message.content).toBe("A refund takes 3-5 days.");
    expect(res.memolm_stats?.verdict).toBe("SAFE_CACHE_HIT");
    expect(res.memolm_stats?.similarity).toBe(0.97);
  });

  it("sends the correct JSON payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 0 });
    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.5,
      max_tokens: 100,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(100);
  });

  it("uses default model when none is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ defaultModel: "llama-3.3-70b", maxRetries: 0 });
    await client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("llama-3.3-70b");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("error handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws UpstreamProviderError on 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { message: "Groq rate limit exceeded", type: "upstream_error" } }, 502)
    ));

    const client = new MemoLM({ maxRetries: 0 });
    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(UpstreamProviderError);
  });

  it("throws SafetyGateRejectionError on 400 with rejection_reasons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeJsonResponse({
        error: { message: "Safety Gate rejected" },
        rejection_reasons: ["knowledge_version_mismatch", "risk_policy_exceeded"],
      }, 400)
    ));

    const client = new MemoLM({ maxRetries: 0 });
    const err = await client.chat.completions
      .create({ messages: [{ role: "user", content: "hi" }] })
      .catch((e) => e);

    expect(err).toBeInstanceOf(SafetyGateRejectionError);
    expect(err.rejectionReasons).toContain("knowledge_version_mismatch");
    expect(err.rejectionReasons).toContain("risk_policy_exceeded");
    expect(err.status).toBe(400);
  });

  it("throws plain MemoLMError on 400 without rejection_reasons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { message: "Bad request" } }, 400)
    ));

    const client = new MemoLM({ maxRetries: 0 });
    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(MemoLMError);
  });

  it("throws GatewayUnavailableError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const client = new MemoLM({ maxRetries: 0 });
    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(GatewayUnavailableError);
  });
});
