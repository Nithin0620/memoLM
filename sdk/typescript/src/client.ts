import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  MemoLMClientConfig,
  MemoLMStats,
  SessionMetrics,
} from "./types";
import { MemoLMError, UpstreamProviderError, SafetyGateRejectionError, GatewayUnavailableError, CacheMissError } from "./errors";
import { Cache } from "./cache";
import { createSSEStream } from "./streaming";

// Status codes that warrant a retry
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const DEFAULT_MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;

function computeBackoffMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempt));
  return Math.random() * ceiling;
}

function getRetryAfterMs(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (value === null) return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : Math.min(parsed * 1000, BACKOFF_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Completions {
  private client: MemoLM;

  constructor(client: MemoLM) {
    this.client = client;
  }

  /**
   * Creates a model response for the given chat conversation.
   * Intercepts requests through the MemoLM Safety Gate and Semantic Cache.
   */
  async create(
    params: ChatCompletionCreateParamsStreaming
  ): Promise<AsyncGenerator<ChatCompletionChunk, void, unknown>>;
  async create(
    params: ChatCompletionCreateParamsNonStreaming
  ): Promise<ChatCompletion>;
  async create(
    params: ChatCompletionCreateParams
  ): Promise<ChatCompletion | AsyncGenerator<ChatCompletionChunk, void, unknown>> {
    return this.client._postChatCompletion(params);
  }
}

export class Chat {
  public completions: Completions;

  constructor(client: MemoLM) {
    this.completions = new Completions(client);
  }
}

export class MemoLM {
  public baseURL: string;
  public apiKey: string;
  public defaultTenant: string;
  public defaultKnowledgeVersion: string;
  public defaultRisk: string;
  public defaultModel?: string;
  public defaultHeaders: Record<string, string>;
  public maxRetries: number;

  public fallbackToUpstream: boolean;
  public upstreamProvider: string;
  public upstreamApiKey?: string;
  public upstreamBaseURL?: string;

  public onCacheHit?: (stats: MemoLMStats) => void;
  public onCacheMiss?: (stats: MemoLMStats) => void;
  public onSafetyReject?: (reasons: string[]) => void;

  private _metrics: {
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    safetyRejections: number;
    totalLatencySavedSec: number;
    estimatedCostSavedUsd: number;
  };

  public chat: Chat;
  public cache: Cache;

  constructor(config: MemoLMClientConfig = {}) {
    let base = config.baseURL || "http://localhost:8000";
    base = base.replace(/\/+$/, "");
    this.baseURL = base;

    this.apiKey = config.apiKey || "memo-key";
    this.defaultTenant = config.defaultTenant || "default-tenant";
    this.defaultKnowledgeVersion = config.defaultKnowledgeVersion || "v1";
    this.defaultRisk = config.defaultRisk || "low";
    this.defaultModel = config.defaultModel;
    this.defaultHeaders = config.defaultHeaders || {};
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

    this.fallbackToUpstream = config.fallbackToUpstream ?? false;
    this.upstreamProvider = config.upstreamProvider || "groq";
    this.upstreamApiKey =
      config.upstreamApiKey ||
      (typeof process !== "undefined" ? process.env?.GROQ_API_KEY || process.env?.OPENAI_API_KEY : undefined);
    this.upstreamBaseURL =
      config.upstreamBaseURL ||
      (this.upstreamProvider === "openai" ? "https://api.openai.com/v1" : "https://api.groq.com/openai/v1");

    this.onCacheHit = config.onCacheHit;
    this.onCacheMiss = config.onCacheMiss;
    this.onSafetyReject = config.onSafetyReject;

    this._metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      safetyRejections: 0,
      totalLatencySavedSec: 0.0,
      estimatedCostSavedUsd: 0.0,
    };

    this.chat = new Chat(this);
    this.cache = new Cache(this);
  }

  /**
   * Retrieves aggregate session metrics.
   */
  public getSessionMetrics(): SessionMetrics {
    const total = this._metrics.totalRequests;
    const hits = this._metrics.cacheHits;
    const hitRatePct = total > 0 ? Number(((hits / total) * 100).toFixed(2)) : 0.0;
    const latency = Math.round(this._metrics.totalLatencySavedSec);
    const cost = this._metrics.estimatedCostSavedUsd.toFixed(2);
    return {
      ...this._metrics,
      hitRatePct,
      toString() {
        return `Total requests: ${total} | Hits: ${hits} (${hitRatePct.toFixed(1)}%) | Latency Saved: ${latency}s | Cost Saved: $${cost}`;
      },
    };
  }

  private _recordStats(stats?: MemoLMStats): void {
    this._metrics.totalRequests++;
    if (!stats) {
      this._metrics.cacheMisses++;
      return;
    }

    const verdict = (stats.verdict || stats.hitType || "").toUpperCase();
    if (verdict.includes("HIT")) {
      this._metrics.cacheHits++;
      let saved = stats.latency_saved ?? stats.latencySaved ?? (stats.latency_saved_ms ? stats.latency_saved_ms / 1000 : 0.0);
      if (saved > 100.0) saved /= 1000.0;
      this._metrics.totalLatencySavedSec += Number(saved.toFixed(3));
      const costSaved = stats.cost_saved ?? stats.costSaved ?? stats.estimatedCostUsd ?? 0.005;
      this._metrics.estimatedCostSavedUsd += Number(costSaved.toFixed(5));
      if (this.onCacheHit) {
        try { this.onCacheHit(stats); } catch { /* callback error swallowed */ }
      }
    } else if (verdict.includes("SAFETY_REJECTED") || verdict.includes("REJECT")) {
      const reasons = stats.rejection_reasons || stats.rejectionReasons || [];
      this._recordSafetyRejection(reasons, true);
      if (this.onCacheMiss) {
        try { this.onCacheMiss(stats); } catch { /* callback error swallowed */ }
      }
    } else {
      this._metrics.cacheMisses++;
      if (this.onCacheMiss) {
        try { this.onCacheMiss(stats); } catch { /* callback error swallowed */ }
      }
    }
  }

  private _recordSafetyRejection(reasons: string[], fromStats = false): void {
    if (!fromStats) {
      this._metrics.totalRequests++;
    }
    this._metrics.safetyRejections++;
    if (this.onSafetyReject) {
      try { this.onSafetyReject(reasons); } catch { /* callback error swallowed */ }
    }
  }

  private _buildHeaders(params: {
    knowledgeVersion?: string;
    tenantId?: string;
    risk?: string;
    ttlSeconds?: number;
    forceRefresh?: boolean;
    cacheOnly?: boolean;
    similarityThreshold?: number;
    extraHeaders?: Record<string, string>;
  }): Record<string, string> {
    const selectedVersion = params.knowledgeVersion || this.defaultKnowledgeVersion;
    const selectedTenant = params.tenantId || this.defaultTenant;
    const selectedRisk = params.risk || this.defaultRisk;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "x-memolm-tenant": selectedTenant,
      "x-memolm-version": selectedVersion,
      "x-memolm-knowledge-version": selectedVersion,
      "x-memolm-risk": selectedRisk,
      ...this.defaultHeaders,
      ...params.extraHeaders,
    };

    if (params.ttlSeconds !== undefined) {
      headers["x-memolm-ttl"] = String(params.ttlSeconds);
    }
    if (params.forceRefresh) {
      headers["x-memolm-force-refresh"] = "true";
    }
    if (params.cacheOnly) {
      headers["x-memolm-cache-only"] = "true";
    }
    if (params.similarityThreshold !== undefined) {
      headers["x-memolm-similarity-threshold"] = String(params.similarityThreshold);
    }

    return headers;
  }

  private _buildEndpoint(): string {
    if (this.baseURL.endsWith("/openai/v1") || this.baseURL.endsWith("/v1")) {
      return `${this.baseURL}/chat/completions`;
    }
    return `${this.baseURL}/openai/v1/chat/completions`;
  }

  private _parseErrorBody(body: any, status: number): never {
    const message: string =
      body?.error?.message ||
      body?.message ||
      `MemoLM Gateway error (${status})`;

    const rejectionReasons: string[] =
      body?.rejection_reasons ||
      body?.error?.rejection_reasons ||
      [];

    if (status === 404 && (body?.error?.type === "cache_miss" || body?.type === "cache_miss")) {
      throw new CacheMissError(message, status, body);
    }
    if (status === 502) {
      throw new UpstreamProviderError(message, status, body);
    }
    if (status === 400 && rejectionReasons.length > 0) {
      this._recordSafetyRejection(rejectionReasons);
      throw new SafetyGateRejectionError(message, rejectionReasons);
    }
    throw new MemoLMError(message, status, body);
  }

  private async _executeFallback(
    payload: any,
    stream: boolean
  ): Promise<ChatCompletion | AsyncGenerator<ChatCompletionChunk, void, unknown>> {
    console.warn(
      `[MemoLM] Gateway unavailable; failing open to upstream ${this.upstreamProvider} at ${this.upstreamBaseURL}`
    );
    const upstreamUrl = `${this.upstreamBaseURL?.replace(/\/+$/, "")}/chat/completions`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.upstreamApiKey || ""}`,
    };

    let response: Response;
    try {
      response = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new UpstreamProviderError(`Direct upstream fallback failed: ${err.message}`, 502, err);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new UpstreamProviderError(`Direct upstream fallback failed (${response.status}): ${errText}`, response.status);
    }

    if (stream) {
      return createSSEStream(response);
    }

    this._metrics.totalRequests++;
    this._metrics.cacheMisses++;
    return (await response.json()) as ChatCompletion;
  }

  /**
   * Internal method executing the POST request to the completions endpoint.
   */
  async _postChatCompletion(
    params: ChatCompletionCreateParams
  ): Promise<ChatCompletion | AsyncGenerator<ChatCompletionChunk, void, unknown>> {
    const {
      knowledgeVersion,
      tenantId,
      risk,
      ttlSeconds,
      forceRefresh,
      cacheOnly,
      similarityThreshold,
      extraHeaders,
      model,
      stream,
      ...bodyParams
    } = params;

    const targetEndpoint = this._buildEndpoint();
    const headers = this._buildHeaders({
      knowledgeVersion,
      tenantId,
      risk,
      ttlSeconds,
      forceRefresh,
      cacheOnly,
      similarityThreshold,
      extraHeaders,
    });
    const selectedModel = model || this.defaultModel || "openai/gpt-oss-20b";

    const payload = {
      model: selectedModel,
      ...bodyParams,
      ...(stream ? { stream: true } : {}),
    };

    // Streaming: no retry — can't replay a consumed stream
    if (stream) {
      let response: Response;
      try {
        response = await fetch(targetEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        if (this.fallbackToUpstream) {
          return this._executeFallback(payload, true);
        }
        throw new GatewayUnavailableError(
          `Failed to connect to MemoLM Gateway at ${targetEndpoint}: ${err?.message ?? err}`
        );
      }

      if (!response.ok) {
        let errorBody: any = null;
        try { errorBody = await response.json(); } catch { /* ignore */ }
        this._parseErrorBody(errorBody, response.status);
      }

      return createSSEStream(response);
    }

    // Non-streaming: retry on transient errors
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let response: Response;

      try {
        response = await fetch(targetEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        if (this.fallbackToUpstream) {
          return this._executeFallback(payload, false);
        }
        throw new GatewayUnavailableError(
          `Failed to connect to MemoLM Gateway at ${targetEndpoint}: ${err?.message ?? err}`
        );
      }

      if (!response.ok) {
        let errorBody: any = null;
        try { errorBody = await response.json(); } catch { /* ignore */ }

        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
          const delayMs =
            getRetryAfterMs(response.headers) ?? computeBackoffMs(attempt);
          await sleep(delayMs);
          lastError = new MemoLMError(
            errorBody?.error?.message || `HTTP ${response.status}`,
            response.status,
            errorBody
          );
          continue;
        }

        this._parseErrorBody(errorBody, response.status);
      }

      const json = (await response.json()) as ChatCompletion;
      this._recordStats(json.memolm_stats);
      return json;
    }

    if (this.fallbackToUpstream) {
      return this._executeFallback(payload, false);
    }

    throw lastError ?? new MemoLMError("Unexpected retry loop exit");
  }
}
