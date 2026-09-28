#!/usr/bin/env python3
"""
Streaming chat example using the MemoLM Python SDK.
Demonstrates Server-Sent Events (SSE) token streaming.
"""

import sys
from memolm import MemoLM

def main():
    client = MemoLM(
        base_url="http://localhost:8000",
        default_knowledge_version="v12",
    )

    print("Streaming MemoLM response:\n")
    stream = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "user", "content": "Explain quantum computing in 2 sentences."}
        ],
        stream=True,
    )

    for chunk in stream:
        if chunk.content:
            sys.stdout.write(chunk.content)
            sys.stdout.flush()

    print("\n\nStream completed.")


if __name__ == "__main__":
    main()
