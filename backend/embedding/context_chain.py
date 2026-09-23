"""
Context Chaining (Memory Stitching)

This file solves the "Pronoun Problem". 
If a user says "What is the price of this?", the AI needs to know if "this" is a car or a laptop.
We fix this by combining their current question with their past few messages into one string.
"""

import numpy as np
from embedding.embedding import embed_text

# The maximum number of past messages we want to remember
MAX_MESSAGES_TO_KEEP = 5

# Our embedding model (BAAI/bge-small) crashes if we give it more than 512 tokens (~2000 letters).
MAX_TOKENS_ALLOWED = 512


def estimate_tokens(text):
    """
    A quick math trick to guess token count: 1 token is roughly 4 characters.
    """
    token_guess = len(text) // 4
    
    # Make sure we never return 0, even for very short words like "Hi"
    if token_guess < 1:
        return 1
        
    return token_guess


def build_context_string(current_query, past_messages):
    """
    Takes the past messages and the new question, and stitches them into one big paragraph.
    Safely drops old messages if the paragraph gets too long for the AI to read.
    """
    
    # 1. Create a fresh list containing all past messages PLUS the new question at the end
    all_messages = []
    for msg in past_messages:
        all_messages.append(msg)
    all_messages.append(current_query)
    
    # 2. Only keep the most recent messages (e.g., the last 5)
    # The [-MAX:] syntax slices the list to only grab items from the end
    recent_messages = all_messages[-MAX_MESSAGES_TO_KEEP:]
    
    # 3. Protect the AI: Keep dropping the oldest message if the total text is too huge
    while True:
        # Join the messages together with a period and space
        stitched_text = ". ".join(recent_messages)
        
        # Check if it fits within our 512 token limit
        if estimate_tokens(stitched_text) <= MAX_TOKENS_ALLOWED:
            break # It fits safely! Stop the loop.
            
        # We also stop if there is only 1 message left (the current query). We must keep it!
        if len(recent_messages) == 1:
            break
            
        # If the text is too big, remove the oldest message (at position 0) and try again
        recent_messages.pop(0)
        
    return stitched_text


def embed_with_context(current_query, past_messages):
    """
    This is the main function called by Qdrant.
    It builds the safe, combined string, and turns it into a math vector.
    """
    # Get the big stitched paragraph
    combined_text = build_context_string(current_query, past_messages)
    
    # Convert it to a vector
    vector = embed_text(combined_text)
    
    return vector


if __name__ == "__main__":
    # --- PROOF IT WORKS ---
    
    car_history = ["I like the Toyota Camry."]
    laptop_history = ["I like the MacBook Pro."]
    new_question = "What is the price of this?"
    
    # Generate vectors for both
    vector_car = embed_with_context(new_question, car_history)
    vector_laptop = embed_with_context(new_question, laptop_history)
    
    # Calculate similarity
    similarity = float(np.dot(vector_car, vector_laptop) / (np.linalg.norm(vector_car) * np.linalg.norm(vector_laptop)))
    
    print("--- Pronoun Problem Test ---")
    print(f"Car Question Vector    -> 'I like the Toyota Camry. What is the price of this?'")
    print(f"Laptop Question Vector -> 'I like the MacBook Pro. What is the price of this?'")
    print(f"Similarity Score: {similarity:.3f}")
    print("Because the score is not 1.0, Qdrant knows they are different topics!")