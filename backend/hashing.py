import hashlib
import json

def hash_text(text: str) -> str:
    """
    Takes a simple string, encodes it, and returns a secure SHA-256 hash.
    """
    encoded_text = text.encode("utf-8")
    return hashlib.sha256(encoded_text).hexdigest()

def hash_messages(messages: list) -> str:
    """
    Takes the ENTIRE conversation history (messages array) and hashes it.
    By hashing the whole history, we prevent the "Pronoun Problem" 
    (e.g. asking "what is the price of this?" after talking about a car vs a laptop).
    """
    # 1. Convert the entire messages array into a single, predictable string.
    # We use json.dumps with sort_keys=True so that the exact same history
    # always produces the exact same string, even if dictionary keys are out of order.
    messages_string = json.dumps(messages, sort_keys=True)
    
    # 2. Hash that massive string into a short, secure key for Redis
    return hash_text(messages_string)

if __name__ == "__main__":
    # Example 1: Asking about a car
    car_history = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "I like the Toyota Camry."},
        {"role": "user", "content": "What is the price of this?"}
    ]
    
    # Example 2: Asking about a laptop
    laptop_history = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "I like the MacBook Pro."},
        {"role": "user", "content": "What is the price of this?"}
    ]
    
    hash_car = hash_messages(car_history)
    hash_laptop = hash_messages(laptop_history)
    
    print("Car Hash:   ", hash_car)
    print("Laptop Hash:", hash_laptop)
    print("Are they the same?", hash_car == hash_laptop) # This will be False!