# MemoLM Documentation Master Index 📚

Welcome to the **MemoLM** technical documentation suite.

## 🏁 Start Here
1. [**`00_CORE_CONCEPTS_AND_WHY.md`**](00_CORE_CONCEPTS_AND_WHY.md) — The fundamental mental model: Why semantic caching alone breaks in production and how the Safety Gate solves it.
2. [**`00_QUICKSTART_AND_SETUP.md`**](00_QUICKSTART_AND_SETUP.md) — 1-minute local development setup, Docker compose services, port mappings, and mock mode guide.

---

## 👥 Module Ownership & Developer Guides

Each core module of MemoLM has its own dedicated directory with end-to-end architecture and implementation specifications:

| Module | Component | Owner | Tech Stack | Documentation Directory |
| :--- | :--- | :--- | :--- | :--- |
| **`1`** | **App & UI** | Frontend Dev | Next.js 14, Tailwind, Tremor/Recharts | [**`docs/1_app_and_ui/`**](1_app_and_ui/README.md) |
| **`2`** | **Core Engine & Gateway** | Backend Dev | Python 3.11, FastAPI, Redis, Qdrant | [**`docs/2_core_engine/`**](2_core_engine/README.md) |
| **`3a`** | **Python SDK** | Python Dev | Python 3.9+, Pydantic | [**`docs/3a_python_sdk/`**](3a_python_sdk/README.md) |
| **`3b`** | **TypeScript SDK** | TS/JS Dev | TypeScript, Fetch/OpenAI wire | [**`docs/3b_typescript_sdk/`**](3b_typescript_sdk/README.md) |
