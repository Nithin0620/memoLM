# MemoLM Documentation Index 📚

Welcome to the **MemoLM** technical documentation suite.

## 👥 Module Ownership & Guides for Developers

Each core module of MemoLM has its own dedicated documentation guide and specification for developers:

| Module | Component | Owner | Tech Stack | Documentation |
| :--- | :--- | :--- | :--- | :--- |
| **`1`** | **App & UI** | Frontend Dev | Next.js 14, Tailwind, Tremor/Recharts | [**`docs/1_app_and_ui/`**](1_app_and_ui/README.md) |
| **`2`** | **Core Engine & Gateway** | Backend Dev | Python 3.11, FastAPI, Redis, Qdrant | [**`docs/2_core_engine/`**](2_core_engine/README.md) |
| **`3a`** | **Python SDK** | Python Dev | Python 3.9+, Pydantic | [**`docs/3a_python_sdk/`**](3a_python_sdk/README.md) |
| **`3b`** | **TypeScript SDK** | TS/JS Dev | TypeScript, Fetch/OpenAI wire | [**`docs/3b_typescript_sdk/`**](3b_typescript_sdk/README.md) |

---

## 📑 System Specifications

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
