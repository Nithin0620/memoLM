# MemoLM Documentation Index 📚

Welcome to the **MemoLM** technical documentation.

## 📑 Contents

1. [**System Architecture & Technical Design**](01_architecture.md)
   * High-level system topology
   * Request lifecycle from ingress to provider
   * Key namespaces & data storage layout

2. [**Gateway & Provider API Specification**](02_gateway_api.md)
   * `POST /v1/chat/completions` contract
   * Supported providers (OpenAI, Gemini)
   * Custom MemoLM headers & configuration parameters

3. [**The Safety Gate Engine**](03_safety_gate.md)
   * Why semantic similarity is not enough
   * Safety verification layers (Knowledge Version, TTL, Risk Policy, Tenant)
   * Rejection reasons & explainability traces

4. [**Client SDKs (Python & TypeScript)**](04_sdks.md)
   * Python SDK usage & examples
   * TypeScript SDK usage & examples
   * Zero-code migration with native OpenAI SDK

5. [**Observability Dashboard & Playground**](05_dashboard_playground.md)
   * Realtime metrics (Cost saved, Latency saved, Hit rates)
   * Explainable decision trace rendering
   * Interactive judge demo sequence
