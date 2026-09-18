# MemoLM Backend (Core Engine & Gateway)

FastAPI async gateway with Redis exact cache, Qdrant semantic search, and the Safety Gate engine.

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
See [Backend Docs](../docs/2_core_engine/README.md) for full implementation details.
