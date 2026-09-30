export type Role = "user" | "assistant" | "system";

export type VerdictType =
  | "SAFE_CACHE_HIT"
  | "EXACT_CACHE_HIT"
  | "SEMANTIC_CACHE_HIT"
  | "CACHE_MISS"
  | "SAFETY_REJECTED"
  | "REJECTED";

export interface SafetyChecks {
  knowledge_version_match?: boolean;
  ttl_fresh?: boolean;
  tenant_match?: boolean;
  risk_policy_pass?: boolean;
  model_match?: boolean;
}

export interface ExplainabilityData {
  verdict: VerdictType;
  similarity: number;
  required_similarity?: number;
  latency_ms: number;
  latency_saved_ms: number;
  cost_saved_usd: number;
  rejection_reasons?: string[];
  knowledge_version?: string;
  cached_version?: string;
  tenant_id?: string;
  risk?: string;
  matched_query?: string;
  checks?: SafetyChecks;
}

export interface DemoMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  explainability?: ExplainabilityData;
}
