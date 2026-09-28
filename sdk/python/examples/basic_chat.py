#!/usr/bin/env python3
"""
Basic chat example using the MemoLM Python SDK.
Demonstrates cache hits, Safety Gate metadata inspection, and custom tenant/version tags.
"""

from memolm import MemoLM

def main():
    # 1. Initialize MemoLM client (points to local or remote gateway)
    client = MemoLM(
        base_url="http://localhost:8000",
        api_key="memo-key",
        default_tenant="acme-corp",
        default_knowledge_version="v12",
        default_risk="low",
    )

    print("--- 1. First Request (Cold LLM Call / Cache Miss) ---")
    response1 = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent."},
            {"role": "user", "content": "How do I request a refund?"},
        ],
        knowledge_version="v12",
        tenant_id="acme-corp",
        risk="low",
    )

    print(f"Response: {response1.content}\n")
    if response1.memolm_stats:
        print(f"MemoLM Stats: {response1.memolm_stats.model_dump_json(indent=2)}")
    else:
        print("No cache metadata returned (Cold LLM execution).")

    print("\n--- 2. Second Request (Semantic Paraphrase -> Instant Cache Hit) ---")
    response2 = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent."},
            {"role": "user", "content": "What is the refund process?"},
        ],
        knowledge_version="v12",
        tenant_id="acme-corp",
        risk="low",
    )

    print(f"Response: {response2.content}\n")
    if response2.memolm_stats:
        print(f"Cache Verdict: {response2.memolm_stats.verdict or response2.memolm_stats.hit_type}")
        print(f"Similarity: {response2.memolm_stats.similarity}")
        print(f"Latency Saved: {response2.memolm_stats.latency_saved}ms")


if __name__ == "__main__":
    main()
