import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  MemoLMClientConfig,
} from "./types";
import { MemoLMError, UpstreamProviderError, SafetyGateRejectionError, GatewayUnavailableError } from "./errors";
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

  public chat: Chat;

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

    this.chat = new Chat(this);
  }

  private _buildHeaders(params: {
    knowledgeVersion?: string;
    tenantId?: string;
    risk?: string;
    ttlSeconds?: number;
    extraHeaders?: Record<string, string>;
  }): Record<string, string> {
    const selectedVersion = params.knowledgeVersion || this.defaultKnowledgeVersion;
    const selectedTenant = params.tenantId || this.defaultTenant;
    const selectedRisk = params.risk || this.defaultRisk;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "x-memolm-tenant": selectedTenant,
      // Send both header names for full parity with the Python SDK
      "x-memolm-version": selectedVersion,
      "x-memolm-knowledge-version": selectedVersion,
      "x-memolm-risk": selectedRisk,
      ...this.defaultHeaders,
      ...params.extraHeaders,
    };

    if (params.ttlSeconds !== undefined) {
      headers["x-memolm-ttl"] = String(params.ttlSeconds);
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

    if (status === 502) {
      throw new UpstreamProviderError(message, status, body);
    }
    if (status === 400 && rejectionReasons.length > 0) {
      throw new SafetyGateRejectionError(message, rejectionReasons);
    }
    throw new MemoLMError(message, status, body);
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
      extraHeaders,
      model,
      stream,
      ...bodyParams
    } = params;

    const targetEndpoint = this._buildEndpoint();
    const headers = this._buildHeaders({ knowledgeVersion, tenantId, risk, ttlSeconds, extraHeaders });
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
        // Network / DNS failure — not retryable
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
      return json;
    }

    // Unreachable but satisfies TypeScript
    throw lastError ?? new MemoLMError("Unexpected retry loop exit");
  }
}
