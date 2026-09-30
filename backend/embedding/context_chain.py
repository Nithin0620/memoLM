"""
Context Chaining (Weighted Vector Fusion)

The previous approach stitched the current question and every prior turn into one
paragraph and embedded that single string. Flat concatenation is a poor
aggregator: the longest text wins. Assistant prose is bulky and near-identical
between turns, so it swamped the actual question and pushed cosine toward 1.0 for
completely unrelated prompts.

We now embed the current query and the last 1-2 user turns as SEPARATE vectors and
blend them in vector space, weighted heavily toward the current query, then
normalise to a unit vector for cosine distance.
"""

import numpy as np
from embedding.embedding import embed_text

# The current question is the retrieval key, so it dominates the blend. The
# context term exists only to break ties (e.g. "what is the price of this?").
CURRENT_QUERY_WEIGHT = 0.80
CONTEXT_WEIGHT = 0.20

# How many prior user turns are worth fusing in. Deliberately small — each extra
# turn dilutes the signal of the question being asked right now.
MAX_CONTEXT_MESSAGES = 2


def embed_with_context(current_query, past_messages):
    """
    This is the main function called by Qdrant, on both read and write.

    1. Filters to USER queries only (assistant responses are ignored).
    2. Blends 80% current query + 20% recent user context in vector space.
    3. Returns a unit-length vector so Qdrant's cosine distance is meaningful.

    `past_messages` arrives already reduced to user turns by
    `qdrant_store.user_chain`, but dicts are tolerated here too.
    """
    # Embed the current query (primary signal)
    current_vec = embed_text(current_query)

    # Filter only user strings (ignore assistant responses)
    user_history = []
    for m in past_messages:
        content = m["content"] if isinstance(m, dict) else m
        role = m.get("role") if isinstance(m, dict) else "user"
        if role == "user" and isinstance(content, str) and content != current_query:
            user_history.append(content)

    # No usable context — the query alone is the key
    if not user_history:
        return _unit(current_vec)

    # Only take the immediate last 1-2 user questions
    recent_context = " ".join(user_history[-MAX_CONTEXT_MESSAGES:])
    context_vec = embed_text(recent_context)

    # 80% current query weight + 20% context weight
    fused_vec = (CURRENT_QUERY_WEIGHT * current_vec) + (CONTEXT_WEIGHT * context_vec)

    return _unit(fused_vec)


def _unit(vector):
    """Normalise to unit length; pass through a zero vector untouched."""
    norm = np.linalg.norm(vector)
    return vector / norm if norm > 0 else vector


if __name__ == "__main__":
    # --- PROOF IT WORKS ---

    car_history = ["I like the Toyota Camry."]
    laptop_history = ["I like the MacBook Pro."]
    new_question = "What is the price of this?"

    vector_car = embed_with_context(new_question, car_history)
    vector_laptop = embed_with_context(new_question, laptop_history)

    similarity = float(
        np.dot(vector_car, vector_laptop)
        / (np.linalg.norm(vector_car) * np.linalg.norm(vector_laptop))
    )

    print("--- Pronoun Problem Test (Weighted Vector Fusion) ---")
    print(f"Car Question Vector    -> 0.80 * {new_question!r} + 0.20 * {car_history[0]!r}")
    print(f"Laptop Question Vector -> 0.80 * {new_question!r} + 0.20 * {laptop_history[0]!r}")
    print(f"Similarity Score: {similarity:.4f}")
    print(
        "NOTE: the two differ, but only slightly. The context term carries 0.20 of "
        "the\nvector, so the pronoun is still mostly drowned out by the shared query. "
        "This\nmodule resolves the question, not the trust decision — see "
        "SIMILARITY_FLOOR in\nqdrant_store.py for that."
    )
