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

  /**
   * Maximum number of retry attempts on transient errors (429, 500, 503).
   * @default 2
   */
  maxRetries?: number;

  /**
   * When true, if the MemoLM gateway is unavailable or times out,
   * the client automatically fails open and executes directly against the upstream provider.
   * @default false
   */
  fallbackToUpstream?: boolean;

  /**
   * Upstream provider to fallback to ("openai" | "groq").
   * @default "groq"
   */
  upstreamProvider?: "openai" | "groq" | string;

  /**
   * Upstream API key used if fallbackToUpstream is enabled.
   */
  upstreamApiKey?: string;

  /**
   * Upstream base URL used if fallbackToUpstream is enabled.
   */
  upstreamBaseURL?: string;

  /**
   * Callback fired when a verified safe cache hit is returned.
   */
  onCacheHit?: (stats: MemoLMStats) => void;

  /**
   * Callback fired when a cache miss routes to the LLM.
   */
  onCacheMiss?: (stats: MemoLMStats) => void;

  /**
   * Callback fired when the Safety Gate rejects a candidate.
   */
  onSafetyReject?: (rejectionReasons: string[]) => void;
}

export interface SessionMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  safetyRejections: number;
  totalLatencySavedSec: number;
  estimatedCostSavedUsd: number;
  hitRatePct: number;
  toString?: () => string;
}

export interface InvalidateParams {
  version?: string;
  tenantId?: string;
}

export interface InvalidateResult {
  status: string;
  message?: string;
  deleted_count: number;
  tenant_id?: string | null;
  version?: string | null;
}

export interface InspectParams {
  query?: string;
  messages?: Message[];
  tenantId?: string;
  version?: string;
  risk?: RiskLevel;
  similarityThreshold?: number;
}

export interface InspectResult {
  candidate_found: boolean;
  verdict: string;
  similarity: number;
  required_similarity?: number;
  rejection_reasons: string[];
  cached_response?: string | null;
  cached_version?: string | null;
  tenant_id?: string | null;
  ttl_remaining_seconds?: number;
  matched_query?: string | null;
}

export interface QAPair {
  question: string;
  answer: string;
  tenantId?: string;
  version?: string;
  risk?: RiskLevel;
  ttlSeconds?: number;
  provider?: string;
  model?: string;
}

export interface SeedResult {
  status: string;
  seeded_count: number;
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
   * When true, skips cache reading, forces a fresh LLM call, and updates the cache.
   * @default false
   */
  forceRefresh?: boolean;

  /**
   * When true, only returns if there is a safe cache hit; does not query upstream LLM on a miss.
   * @default false
   */
  cacheOnly?: boolean;

  /**
   * Explicit cosine similarity threshold override for this request (e.g. 0.95).
   */
  similarityThreshold?: number;

  /**
   * Sampling temperature between 0 and 2.
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate.
   */
  max_tokens?: number;

  /**
   * TTL in seconds for the cached response. Overrides the gateway default.
   */
  ttlSeconds?: number;

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
