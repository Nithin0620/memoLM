import numpy as np
from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"
_model = None

def get_model():
    """Loads the AI embedding model into memory only once (Singleton pattern)"""
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=MODEL_NAME)
    return _model

def embed(texts: list) -> list:
    # Takes a list of strings and converts them all into math vectors
    model = get_model()
    embeddings = []
    for vector in model.embed(list(texts)):
        embeddings.append(np.asarray(vector))
    return embeddings

def embed_text(text: str) -> np.ndarray:
    # """Helper function to convert just a single string into a vector"""
    return embed([text])[0]

def embed_messages_with_context(messages: list) -> np.ndarray:
    """
    Takes the full conversation history and stitches it together BEFORE converting to a vector.
    This prevents Semantic Cache from confusing "tell me the price of this" (car) 
    with "tell me the price of this" (laptop). 

    """
    # 1. If there is only one message, just embed it normally
    if len(messages) == 1:
        # Handle both raw strings and dictionaries
        if isinstance(messages[0], dict):
            return embed_text(messages[0].get("content", ""))
        return embed_text(messages[0])
        
    # 2. Grab the last 5 messages so we have recent context, but not too much noise
    recent_messages = messages[-5:]
    
    stitched_text = ""
    for msg in recent_messages:
        # We check if it's a dict or just a plain string
        if isinstance(msg, dict):
            role = msg.get("role", "user")
            content = msg.get("content", "")
            stitched_text += f"{role}: {content}. "
        else:
            stitched_text += f"{msg}. "
            
    # Remove any extra spaces at the end
    stitched_text = stitched_text.strip()
    
    # 3. Convert this highly contextual paragraph into a single vector!
    return embed_text(stitched_text)

if __name__ == "__main__":
    car_history = [
        {"role": "user", "content": "I like the Toyota Camry."},
        {"role": "user", "content": "What is the price of this?"}
    ]
    
    laptop_history = [
        {"role": "user", "content": "I like the MacBook Pro."},
        {"role": "user", "content": "What is the price of this?"}
    ]
    
    vector_car = embed_messages_with_context(car_history)
    vector_laptop = embed_messages_with_context(laptop_history)
    
    # Calculate similarity to prove they are mathematically different!
    similarity = np.dot(vector_car, vector_laptop) / (np.linalg.norm(vector_car) * np.linalg.norm(vector_laptop))
    print(f"Similarity between Car question and Laptop question: {similarity:.3f}")
    print("Because it is not 1.0, Qdrant will correctly know they are different!")