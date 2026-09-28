import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoLM } from "../src/client";
import { MemoLMError, UpstreamProviderError } from "../src/errors";

function makeJsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeChatResponse(): Response {
  return makeJsonResponse({
    id: "ok",
    object: "chat.completion",
    choices: [{ message: { role: "assistant", content: "success" } }],
  });
}

describe("retry logic", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries on 429 and succeeds on second attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse({ error: { message: "rate limited" } }, 429))
      .mockResolvedValueOnce(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 2 });
    const resultPromise = client.chat.completions
      .create({ messages: [{ role: "user", content: "hi" }] })
      .catch((e) => e);

    await vi.runAllTimersAsync();
    const res = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.choices[0].message.content).toBe("success");
    vi.useRealTimers();
  });

  it("retries on 503 and succeeds on third attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse({ error: { message: "unavailable" } }, 503))
      .mockResolvedValueOnce(makeJsonResponse({ error: { message: "unavailable" } }, 503))
      .mockResolvedValueOnce(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 2 });
    const resultPromise = client.chat.completions
      .create({ messages: [{ role: "user", content: "hi" }] })
      .catch((e) => e);

    await vi.runAllTimersAsync();
    const res = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.choices[0].message.content).toBe("success");
    vi.useRealTimers();
  });

  it("exhausts retries and throws MemoLMError", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { message: "service unavailable" } }, 503)
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 2 });

    // Wrap in a single promise chain so rejection is always caught before
    // the unhandled-rejection handler sees it
    const resultPromise = client.chat.completions
      .create({ messages: [{ role: "user", content: "hi" }] })
      .catch((e) => e);

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeInstanceOf(MemoLMError);
    // 1 initial + 2 retries = 3 total
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("does NOT retry on 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { message: "bad request" } }, 400)
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 2 });
    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(MemoLMError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 502", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { message: "upstream failure" } }, 502)
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 2 });
    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(UpstreamProviderError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects maxRetries: 0 (no retries)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { message: "rate limited" } }, 429)
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 0 });
    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(MemoLMError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses Retry-After header delay when present", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        makeJsonResponse({ error: { message: "rate limited" } }, 429, { "retry-after": "2" })
      )
      .mockResolvedValueOnce(makeChatResponse());
    vi.stubGlobal("fetch", fetchMock);

    const client = new MemoLM({ maxRetries: 1 });
    const resultPromise = client.chat.completions
      .create({ messages: [{ role: "user", content: "hi" }] })
      .catch((e) => e);

    await vi.runAllTimersAsync();
    await resultPromise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
