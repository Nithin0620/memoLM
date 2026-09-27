import { ChatCompletionChunk } from "./types";
import { UpstreamProviderError } from "./errors";

export type Stream<Item> = AsyncIterable<Item>;

/**
 * Creates an AsyncIterable stream that consumes an SSE response body from the MemoLM gateway.
 */
export async function* createSSEStream(
  response: Response
): AsyncGenerator<ChatCompletionChunk, void, unknown> {
  if (!response.body) {
    throw new Error("Response body is empty or not readable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) {
          // Empty line or SSE comment/heartbeat
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6).trim();

          if (data === "[DONE]") {
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // Check if gateway forwarded an upstream error frame
            if (parsed.error) {
              throw new UpstreamProviderError(
                parsed.error.message || "Upstream provider error during streaming",
                502,
                parsed.error
              );
            }

            yield parsed as ChatCompletionChunk;
          } catch (err) {
            if (err instanceof UpstreamProviderError) {
              throw err;
            }
            // Ignore corrupted lines or non-JSON payloads gracefully
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
