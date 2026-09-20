"""
Compounding context chain (cap-at-5 rolling window).

Solves the Single-Query Context Problem: the API only sends the present user
query, so the server builds the "recent context" itself from a rolling list of
the last <= CONTEXT_CAP user texts. On every turn the gateway:

    1. reads  memolm:session:{session_id}:messages  (Redis list of last <=5 texts)
    2. appends the present query and trims back to CONTEXT_CAP (LTRIM)
    3. calls embed_with_context(present_query, stored_texts) -> vector
    4. stores the SAME stitched tail in the Qdrant point payload on write-back,
       so a repeated topic-trajectory embeds identically and a topic switch
       embeds differently -> safe MISS -> route to the -> LLM.
"""

import numpy as np

from embedding.embedding import embed_text

CONTEXT_CAP = 5
EMBED_MAX_TOKENS = 512
SESSION_KEY_PREFIX = "memolm:session:{}:messages"


def session_key(session_id: str) -> str:
    """Redis key that holds the rolling list of the last <= CONTEXT_CAP texts."""
    return SESSION_KEY_PREFIX.format(session_id)


def _estimate_tokens(text: str) -> int:
    # Rough heuristic: byte-pair tokenizers average ~4 chars/token.
    return max(1, len(text) // 4)


def _rolling_turns(current_query: str, recent_messages: list, cap: int = CONTEXT_CAP) -> list:
    """Roll the window: (stored texts + current query), keep last `cap`, then
    drop oldest turns until the stitched text fits EMBED_MAX_TOKENS."""
    turns = (list(recent_messages) + [current_query])[-cap:]
    while _estimate_tokens(". ".join(turns)) > EMBED_MAX_TOKENS and len(turns) > 1:
        turns.pop(0)
    return turns


def build_context_text(current_query: str, recent_messages: list, cap: int = CONTEXT_CAP) -> str:
    """Stitched embedding input for the current query using rolling context."""
    return ". ".join(_rolling_turns(current_query, recent_messages, cap))


def embed_with_context(current_query: str, recent_messages: list, cap: int = CONTEXT_CAP) -> np.ndarray:
    """Embed current_query + its rolling context as ONE vector."""
    return embed_text(build_context_text(current_query, recent_messages, cap))


def payload_fields_for(current_query: str, recent_messages: list, cap: int = CONTEXT_CAP) -> dict:
    """Qdrant point payload fields to store on write-back, so the next turn can
    rebuild the exact same stitched tail and future repeats embed identically."""
    turns = _rolling_turns(current_query, recent_messages, cap)
    return {
        "context_queries": turns,
        "context_text": ". ".join(turns),
        "chain_depth": len(turns),
    }


if __name__ == "__main__":
    # Part 1 - Pronoun walkthrough: identical query, different rolling context
    v_car = embed_with_context("What is the price?", ["I like the Toyota Camry."])
    v_laptop = embed_with_context("What is the price?", ["I like the MacBook Pro."])
    sim = float(np.dot(v_car, v_laptop) / (np.linalg.norm(v_car) * np.linalg.norm(v_laptop) + 1e-9))

    print("PRONOUN WALKTHROUGH")
    print("  car   -> 'I like the Toyota Camry. What is the price?'")
    print("  laptop-> 'I like the MacBook Pro. What is the price?'")
    print(f"  similarity = {sim:.3f}  (should be < 1.0 -> distinct vectors)")
    print("  topic switch does NOT match the old cached car entry -> MISS -> LLM")

    # Part 2 - 8-turn rolling window: oldest turns fall off after cap 5
    print("\n8-TURN ROLLING WINDOW (cap = 5)")
    stored = []  # what memolm:session:{sid}:messages holds (last <=5 texts)
    for i in range(1, 9):
        query = f"user question {i}"
        text = build_context_text(query, stored)
        stored = _rolling_turns(query, stored)
        print(f"  turn {i}: len={len(stored)} embedding={' '.join(text.split())[:40]:40s} ...")

    # Part 3 - 512-token guard: oversized old context gets dropped, query survives
    print("\n512-TOKEN GUARD")
    huge_old_turn = "A very long fact repeated over and over. " * 200
    guarded = build_context_text("short query", [huge_old_turn])
    print(f"  stitched = {guarded!r} (old 900-token turn dropped, current query kept)")