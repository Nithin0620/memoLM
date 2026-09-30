import { ChatCompletionChunk } from "./types";
import { MemoLMError, UpstreamProviderError, SafetyGateRejectionError } from "./errors";

export type Stream<Item> = AsyncIterable<Item>;

/**
 * Creates an AsyncIterable stream that consumes an SSE response body from the MemoLM gateway.
 */
export async function* createSSEStream(
  response: Response
): AsyncGenerator<ChatCompletionChunk, void, unknown> {
  if (!response.body) {
    throw new MemoLMError("Response body is empty or not readable.");
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
          // Empty line or SSE comment/heartbeat — skip
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6).trim();

          if (data === "[DONE]") {
            return;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Non-JSON line from gateway — surface as an error rather than silently dropping
            throw new MemoLMError(
              `Received malformed SSE data from MemoLM Gateway: ${data.slice(0, 120)}`
            );
          }

          // Gateway forwarded an error frame
          if (parsed.error) {
            const errMsg: string =
              parsed.error?.message || "Unknown error in stream";
            const errType: string = parsed.error?.type || "";
            const rejectionReasons: string[] =
              parsed.error?.rejection_reasons || [];

            if (errType === "upstream_error") {
              throw new UpstreamProviderError(errMsg, 502, parsed.error);
            }
            if (errType === "safety_rejected" || rejectionReasons.length > 0) {
              throw new SafetyGateRejectionError(errMsg, rejectionReasons);
            }
            throw new MemoLMError(errMsg, 500, parsed.error);
          }

          yield parsed as ChatCompletionChunk;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
