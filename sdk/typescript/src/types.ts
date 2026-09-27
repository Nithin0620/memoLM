export type RiskLevel = "low" | "medium" | "high";

export interface Message {
  role: "system" | "user" | "assistant" | string;
  content: string;
  name?: string;
}

export interface MemoLMClientConfig {
  /**
   * Base URL of the MemoLM gateway.
   * @default "http://localhost:8000"
   */
  baseURL?: string;

  /**
   * API Key (or provider key) passed to MemoLM.
   * @default "memo-key"
   */
  apiKey?: string;

  /**
   * Default tenant identifier for multi-tenant isolation.
   * @default "default-tenant"
   */
  defaultTenant?: string;

  /**
   * Default knowledge version for Safety Gate checks.
   * @default "v1"
   */
  defaultKnowledgeVersion?: string;

  /**
   * Default risk level for Safety Gate thresholding.
   * @default "low"
   */
  defaultRisk?: RiskLevel;

  /**
   * Default model to use if none is provided in the request.
   */
  defaultModel?: string;

  /**
   * Additional custom headers sent with every request.
   */
  defaultHeaders?: Record<string, string>;
}

export interface ChatCompletionCreateParamsBase {
  /**
   * Model to use (e.g., "openai/gpt-oss-20b", "gpt-4o", "llama-3.3-70b-versatile").
   */
  model?: string;

  /**
   * A list of messages comprising the conversation so far.
   */
  messages: Message[];

  /**
   * Knowledge version for Safety Gate validation (e.g., "v12", "v13").
   * When updated, outdated cached responses are instantly invalidated without data deletion.
   */
  knowledgeVersion?: string;

  /**
   * Tenant ID for multi-tenant isolation.
   */
  tenantId?: string;

  /**
   * Risk level governing the Safety Gate similarity threshold ("low" | "medium" | "high").
   * @default "low"
   */
  risk?: RiskLevel;

  /**
   * Sampling temperature between 0 and 2.
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate.
   */
  max_tokens?: number;

  /**
   * Additional headers to pass for this specific request.
   */
  extraHeaders?: Record<string, string>;

  /**
   * Any additional provider-specific parameters.
   */
  [key: string]: any;
}

export interface ChatCompletionCreateParamsNonStreaming extends ChatCompletionCreateParamsBase {
  stream?: false;
}

export interface ChatCompletionCreateParamsStreaming extends ChatCompletionCreateParamsBase {
  stream: true;
}

export type ChatCompletionCreateParams =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;

export interface MemoLMStats {
  verdict: "SAFE_CACHE_HIT" | "CACHE_MISS" | "SAFETY_REJECTED" | string;
  similarity?: number;
  latency_saved?: number;
  payload?: Record<string, any>;
  [key: string]: any;
}

export interface ChatCompletionChoice {
  index?: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason?: string | null;
}

export interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion" | string;
  created?: number;
  model?: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  memolm_stats?: MemoLMStats;
  [key: string]: any;
}

export interface ChatCompletionChunkChoice {
  index?: number;
  delta: {
    role?: string;
    content?: string | null;
  };
  finish_reason?: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk" | string;
  created?: number;
  model?: string;
  choices: ChatCompletionChunkChoice[];
  memolm_stats?: MemoLMStats;
  [key: string]: any;
}
