"""Configuration loader.

Reads secrets/URLs from the process environment (or backend/.env if you load it
in your shell / container). Credentials are never hardcoded here.

Fill values in backend/.env:
    GROQ_API_KEY=...
    REDIS_URL=...
    QDRANT_URL=...
"""

import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

_REQUIRED = {"GROQ_API_KEY": GROQ_API_KEY}


def _warn_if_missing() -> None:
    for name, value in _REQUIRED.items():
        if not value:
            print(f"[config] WARNING: {name} is empty - set it in backend/.env "
                  "before making provider calls.")


_warn_if_missing()


if __name__ == "__main__":
    print(f"GROQ_API_KEY = {GROQ_API_KEY or '<empty>'}")
    print(f"REDIS_URL    = {REDIS_URL}")
    print(f"QDRANT_URL   = {QDRANT_URL}")