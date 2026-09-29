import { MemoLM } from "./client";
import {
  InvalidateParams,
  InvalidateResult,
  InspectParams,
  InspectResult,
  QAPair,
  SeedResult,
} from "./types";
import { GatewayUnavailableError, MemoLMError } from "./errors";

export class Cache {
  constructor(private readonly client: MemoLM) {}

  /**
   * Invalidate cached entries by knowledge version tag or tenant.
   */
  async invalidate(params: InvalidateParams = {}): Promise<InvalidateResult> {
    const targetEndpoint = `${this.client.baseURL.replace(/\/+$/, "")}/cache/invalidate`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.client.apiKey}`,
    };
    if (params.tenantId) {
      headers["x-memolm-tenant"] = params.tenantId;
    }
    if (params.version) {
      headers["x-memolm-version"] = params.version;
    }

    const payload: Record<string, any> = {};
    if (params.version !== undefined) payload.version = params.version;
    if (params.tenantId !== undefined) payload.tenant_id = params.tenantId;

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
      const errText = await response.text();
      throw new MemoLMError(`Cache invalidation failed (${response.status}): ${errText}`, response.status);
    }

    return (await response.json()) as InvalidateResult;
  }

  /**
   * Dry-run a query against Qdrant to inspect what would hit, cosine similarity,
   * and whether the Safety Gate would pass or reject, without billing an LLM call.
   */
  async inspect(params: InspectParams): Promise<InspectResult> {
    const targetEndpoint = `${this.client.baseURL.replace(/\/+$/, "")}/cache/inspect`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.client.apiKey}`,
    };

    const payload = {
      query: params.query,
      messages: params.messages,
      tenant_id: params.tenantId || this.client.defaultTenant,
      version: params.version || this.client.defaultKnowledgeVersion,
      risk: params.risk || this.client.defaultRisk,
      similarity_threshold: params.similarityThreshold,
    };

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
      const errText = await response.text();
      throw new MemoLMError(`Cache inspect failed (${response.status}): ${errText}`, response.status);
    }

    return (await response.json()) as InspectResult;
  }

  /**
   * Bulk warm-up known documentation or FAQ entries directly into the vector store.
   */
  async seed(items: QAPair[]): Promise<SeedResult> {
    const targetEndpoint = `${this.client.baseURL.replace(/\/+$/, "")}/cache/seed`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.client.apiKey}`,
    };

    let response: Response;
    try {
      response = await fetch(targetEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ items }),
      });
    } catch (err: any) {
      throw new GatewayUnavailableError(
        `Failed to connect to MemoLM Gateway at ${targetEndpoint}: ${err?.message ?? err}`
      );
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new MemoLMError(`Cache seed failed (${response.status}): ${errText}`, response.status);
    }

    return (await response.json()) as SeedResult;
  }
}
