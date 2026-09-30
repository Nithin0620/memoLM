import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoLM } from "../src/client";
import { MemoLMError, UpstreamProviderError, SafetyGateRejectionError } from "../src/errors";

// ---------------------------------------------------------------------------
// Helper: build a fake SSE Response from an array of data lines
// ---------------------------------------------------------------------------

function makeSseResponse(dataLines: string[], status = 200): Response {
  const body = dataLines.map((d) => `data: ${d}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeChunkJson(content: string, id = "c1"): string {
  return JSON.stringify({
    id,
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
}

// ---------------------------------------------------------------------------
// Streaming tests
// ---------------------------------------------------------------------------

describe("streaming completions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("yields all chunks and stops at [DONE]", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSseResponse([
        makeChunkJson("Hello"),
        makeChunkJson(", world"),
        makeChunkJson("!"),
      ])
    ));

    const client = new MemoLM({ maxRetries: 0 });
    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const contents: string[] = [];
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) contents.push(delta);
    }

    expect(contents).toEqual(["Hello", ", world", "!"]);
  });

  it("sets stream: true in the request payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeSseResponse([makeChunkJson("ok")]));
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 0 });
    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });
    // drain the stream
    for await (const _ of stream) {}

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.stream).toBe(true);
  });

  it("throws UpstreamProviderError on in-stream upstream_error frame", async () => {
    const errorFrame = JSON.stringify({
      error: { message: "Groq upstream failure", type: "upstream_error" },
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSseResponse([errorFrame])
    ));

    const client = new MemoLM({ maxRetries: 0 });
    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await expect(async () => {
      for await (const _ of stream) {}
    }).rejects.toThrow(UpstreamProviderError);
  });

  it("throws SafetyGateRejectionError on in-stream safety_rejected frame", async () => {
    const errorFrame = JSON.stringify({
      error: {
        message: "Safety rejected",
        type: "safety_rejected",
        rejection_reasons: ["knowledge_version_mismatch"],
      },
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSseResponse([errorFrame])
    ));

    const client = new MemoLM({ maxRetries: 0 });
    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const err = await (async () => {
      for await (const _ of stream) {}
    })().catch((e) => e);

    expect(err).toBeInstanceOf(SafetyGateRejectionError);
    expect(err.rejectionReasons).toContain("knowledge_version_mismatch");
  });

  it("throws MemoLMError on malformed (non-JSON) SSE data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSseResponse(["not valid json at all"])
    ));

    const client = new MemoLM({ maxRetries: 0 });
    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await expect(async () => {
      for await (const _ of stream) {}
    }).rejects.toThrow(MemoLMError);
  });

  it("handles SSE chunks split across multiple read() calls", async () => {
    // Simulate a chunk split at an arbitrary byte boundary
    const fullSse =
      'data: {"id":"c1","object":"chat.completion.chunk","choices":[{"delta":{"content":"split"}}]}\n\n' +
      "data: [DONE]\n\n";

    // Split into two pieces mid-JSON
    const part1 = fullSse.slice(0, 40);
    const part2 = fullSse.slice(40);

    const encoder = new TextEncoder();
    let callCount = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ done: false, value: encoder.encode(part1) });
        if (callCount === 2) return Promise.resolve({ done: false, value: encoder.encode(part2) });
        return Promise.resolve({ done: true, value: undefined });
      }),
      releaseLock: vi.fn(),
    };

    const mockBody = { getReader: () => mockReader };
    const mockResponse = { ok: true, body: mockBody } as unknown as Response;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const client = new MemoLM({ maxRetries: 0 });
    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        chunks.push(chunk.choices[0].delta.content);
      }
    }

    expect(chunks).toEqual(["split"]);
  });

  it("throws MemoLMError when response body is null", async () => {
    const mockResponse = { ok: true, body: null } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const client = new MemoLM({ maxRetries: 0 });
    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    await expect(async () => {
      for await (const _ of stream) {}
    }).rejects.toThrow(MemoLMError);
  });
});
