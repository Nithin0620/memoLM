import { MemoLM } from "./client";
import { Cache } from "./cache";
import {
  MemoLMClientConfig,
  ChatCompletionCreateParams,
  ChatCompletion,
  ChatCompletionChunk,
  SessionMetrics,
  RiskLevel,
} from "./types";
import { GatewayUnavailableError } from "./errors";

export interface WrapOpenAIOptions extends MemoLMClientConfig {
  /**
   * Alias for baseURL
   */
  gatewayURL?: string;

  /**
   * Shorthand for defaultKnowledgeVersion
   */
  knowledgeVersion?: string;

  /**
   * Shorthand for defaultTenant
   */
  tenantId?: string;

  /**
   * Shorthand for defaultRisk
   */
  risk?: RiskLevel;

  /**
   * When true, if the MemoLM gateway is unreachable, it automatically
   * falls open to calling the original OpenAI client.
   * @default true
   */
  fallbackToUpstream?: boolean;
}

/**
 * Drop-in wrapper for the official OpenAI TypeScript / JavaScript client.
 * Intercepts `client.chat.completions.create` to route requests through MemoLM
 * with safety-gated caching and fail-open resilience.
 *
 * @example
 * ```typescript
 * import OpenAI from "openai";
 * import { wrapOpenAI } from "@memolm/sdk";
 *
 * const openai = wrapOpenAI(new OpenAI(), {
 *   baseURL: "https://memolm.onrender.com",
 *   knowledgeVersion: "v12"
 * });
 *
 * const res = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages: [{ role: "user", content: "What is your refund policy?" }]
 * });
 * ```
 */
export function wrapOpenAI<T extends { chat: { completions: { create: (...args: any[]) => any } }; apiKey?: string }>(
  openaiClient: T,
  options: WrapOpenAIOptions = {}
): T & { memolm: MemoLM; cache: Cache; getSessionMetrics: () => SessionMetrics } {
  const baseURL = options.gatewayURL || options.baseURL || "https://memolm.onrender.com";
  const fallbackToUpstream = options.fallbackToUpstream ?? true;

  const memolm = new MemoLM({
    ...options,
    defaultKnowledgeVersion: options.knowledgeVersion || options.defaultKnowledgeVersion || "v1",
    defaultTenant: options.tenantId || options.defaultTenant || "default-tenant",
    defaultRisk: options.risk || options.defaultRisk || "low",
    fallbackToUpstream: false, // wrapOpenAI itself handles the fail-open fallback to openaiClient
    baseURL,
    apiKey: options.apiKey || openaiClient.apiKey || "memo-key",
  });

  const wrappedCompletions = {
    ...openaiClient.chat.completions,
    create: async (
      params: ChatCompletionCreateParams
    ): Promise<ChatCompletion | AsyncGenerator<ChatCompletionChunk, void, unknown>> => {
      try {
        return await memolm.chat.completions.create(params as any);
      } catch (err) {
        if (err instanceof GatewayUnavailableError && fallbackToUpstream) {
          console.warn(
            `[MemoLM] Gateway unavailable (${err.message}); failing open to original OpenAI client.`
          );
          // Strip MemoLM-specific parameters before passing to official OpenAI SDK
          const {
            knowledgeVersion,
            tenantId,
            risk,
            ttlSeconds,
            forceRefresh,
            cacheOnly,
            similarityThreshold,
            extraHeaders,
            ...cleanParams
          } = params;
          return openaiClient.chat.completions.create(cleanParams as any);
        }
        throw err;
      }
    },
  };

  const wrappedChat = {
    ...openaiClient.chat,
    completions: wrappedCompletions,
  };

  const proxy = new Proxy(openaiClient as any, {
    get(target, prop, receiver) {
      if (prop === "chat") {
        return wrappedChat;
      }
      if (prop === "memolm") {
        return memolm;
      }
      if (prop === "cache") {
        return memolm.cache;
      }
      if (prop === "getSessionMetrics") {
        return () => memolm.getSessionMetrics();
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy;
}
