import os
from groq import Groq

# 1. Point the Groq client to your local MemoLM Gateway!
client = Groq(
    base_url="http://127.0.0.1:8000/v1",
    api_key="memo-key"  # API key doesn't matter for the proxy
)

print("Sending streaming request to MemoLM Gateway...\n")

# 2. Make a streaming request with MemoLM safety headers
response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {"role": "user", "content": "Explain what a semantic cache is in two simple sentences."}
    ],
    stream=True,
    extra_headers={
        "x-memolm-tenant": "acme-corp",
        "x-memolm-version": "v1"
    }
)

# 3. Print the chunks exactly as they stream in!
for chunk in response:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="", flush=True)

print("\n\n✅ Stream Finished!")
