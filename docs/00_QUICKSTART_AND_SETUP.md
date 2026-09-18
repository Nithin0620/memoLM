# 🚀 Local Development & Quickstart Guide

This guide helps any new developer get the entire MemoLM stack running locally in under 2 minutes.

---

## 🏗️ System Ports & Service Map

| Service | Port | Description |
| :--- | :--- | :--- |
| **MemoLM Core Engine** | `http://localhost:8000` | FastAPI Gateway & Safety Gate |
| **MemoLM UI Dashboard** | `http://localhost:3000` | Next.js 14 Web App & Playground |
| **Redis** | `localhost:6379` | Exact Hash Cache & Realtime Metrics |
| **Qdrant Vector DB** | `http://localhost:6333` | Vector Database (Dashboard on `:6333/dashboard`) |

---

## ⚡ 1-Minute Quickstart with Docker

In the root of the repository:

```bash
# 1. Copy example environment variables
cp .env.example .env

# 2. Add your OpenAI or Gemini API key to .env
# OPENAI_API_KEY=sk-...
# GEMINI_API_KEY=AI...

# 3. Start Redis and Qdrant infrastructure
docker compose up -d redis qdrant
```

---

## 🧑‍💻 Running Services Individually

### 1. Backend Core Engine (`2_core_engine`)
```bash
cd backend

# Create virtualenv & activate
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt # or pip install -e .

# Run FastAPI dev server with reload
uvicorn app.main:app --reload --port 8000
```
* **Swagger API Docs:** `http://localhost:8000/docs`
* **Health Check:** `http://localhost:8000/health`

---

### 2. Frontend Dashboard & Playground (`1_app_and_ui`)
```bash
cd frontend

# Install dependencies
npm install # or pnpm install

# Run Next.js dev server
npm run dev
```
* **Web App:** `http://localhost:3000`

---

### 3. Testing Python SDK (`3a_python_sdk`)
```bash
cd sdk/python

pip install -e .
python examples/basic_chat.py
```

---

### 4. Testing TypeScript SDK (`3b_typescript_sdk`)
```bash
cd sdk/typescript

npm install
npm run build
node examples/basic_chat.js
```

---

## 🛠️ Mock / Offline Mode for SDK & Frontend Devs

If backend is not yet running or you don't have an OpenAI API key, start the backend with:
```bash
export MEMOLM_MOCK_MODE=true
uvicorn app.main:app --reload --port 8000
```
In mock mode, MemoLM simulates:
* Real LLM latency (~1.2s on first call, with realistic cost calculation).
* Safe semantic hits on subsequent paraphrased queries (~20ms).
* Instant rejection when `x-memolm-knowledge-version` changes.
