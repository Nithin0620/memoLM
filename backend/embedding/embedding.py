"""
Embedding Generator

This file is responsible for taking normal text (like "Hello world") 
and turning it into a mathematical array of numbers (a Vector) that Qdrant can understand.
"""

import numpy as np
from fastembed import TextEmbedding

# The specific AI model we are using to convert text to math
MODEL_NAME = "BAAI/bge-base-en-v1.5"

# This model always turns a sentence into a list of exactly 384 numbers
EMBEDDING_SIZE = 768

# We store the loaded model here so we only have to load it once (saves time and memory)
_model = None


def get_model():
    """
    Loads the AI embedding model into memory.
    If it is already loaded, it just returns it immediately.
    """
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=MODEL_NAME)
    return _model


def embed(texts):
    """
    Takes a list of sentences and turns every single one into a math vector.
    """
    model = get_model()
    
    # We will store our finished math vectors here
    finished_vectors = []
    
    # Convert the sentences into vectors one by one
    for vector in model.embed(list(texts)):
        # We wrap it in np.asarray so Qdrant and math functions can read it properly
        finished_vectors.append(np.asarray(vector))
        
    return finished_vectors


def embed_text(text):
    """
    Takes just ONE single sentence and turns it into a math vector.
    """
    # We put our 1 sentence in a list, send it to embed(), and then grab the 1st result out
    results = embed([text])
    return results[0]


if __name__ == "__main__":
    # --- PROOF IT WORKS ---
    
    sample_text = "What is the price of this?"
    vector = embed_text(sample_text)
    
    print("--- Embedding Test ---")
    print(f"Model used: {MODEL_NAME}")
    print(f"Total numbers in the vector: {len(vector)} (We expect {EMBEDDING_SIZE})")
    print(f"The first 3 numbers of the math vector: {vector[:3]}")