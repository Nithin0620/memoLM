import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  MemoLMClientConfig,
} from "./types";
import { MemoLMError, UpstreamProviderError } from "./errors";
import { createSSEStream } from "./streaming";

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

  public chat: Chat;

  constructor(config: MemoLMClientConfig = {}) {
    let base = config.baseURL || "http://localhost:8000";
    // Strip trailing slash
    base = base.replace(/\/+$/, "");
    this.baseURL = base;

    this.apiKey = config.apiKey || "memo-key";
    this.defaultTenant = config.defaultTenant || "default-tenant";
    this.defaultKnowledgeVersion = config.defaultKnowledgeVersion || "v1";
    this.defaultRisk = config.defaultRisk || "low";
    this.defaultModel = config.defaultModel;
    this.defaultHeaders = config.defaultHeaders || {};

    this.chat = new Chat(this);
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
      extraHeaders,
      model,
      ...bodyParams
    } = params;

    const selectedModel = model || this.defaultModel || "openai/gpt-oss-20b";
    const selectedKnowledgeVersion =
      knowledgeVersion || this.defaultKnowledgeVersion;
    const selectedTenant = tenantId || this.defaultTenant;
    const selectedRisk = risk || this.defaultRisk;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "x-memolm-tenant": selectedTenant,
      "x-memolm-version": selectedKnowledgeVersion,
      "x-memolm-risk": selectedRisk,
      ...this.defaultHeaders,
      ...extraHeaders,
    };

    // Determine target URL
    let targetEndpoint = `${this.baseURL}/openai/v1/chat/completions`;
    if (this.baseURL.endsWith("/openai/v1") || this.baseURL.endsWith("/v1")) {
      targetEndpoint = `${this.baseURL}/chat/completions`;
    }

    const payload = {
      model: selectedModel,
      ...bodyParams,
    };

    let response: Response;
    try {
      response = await fetch(targetEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new MemoLMError(
        `Failed to connect to MemoLM Gateway at ${targetEndpoint}: ${err.message}`,
        undefined,
        err
      );
    }

    if (!response.ok) {
      let errorBody: any = null;
      let errorText = "";
      try {
        errorText = await response.text();
        errorBody = JSON.parse(errorText);
      } catch {
        // Ignored if non-json
      }

      if (response.status === 502) {
        throw new UpstreamProviderError(
          errorBody?.error?.message ||
            errorText ||
            `Upstream provider error (${response.status})`,
          response.status,
          errorBody
        );
      }

      throw new MemoLMError(
        errorBody?.error?.message ||
          errorText ||
          `MemoLM Gateway error (${response.status})`,
        response.status,
        errorBody
      );
    }

    if (params.stream) {
      return createSSEStream(response);
    }

    const json = (await response.json()) as ChatCompletion;
    return json;
  }
}
