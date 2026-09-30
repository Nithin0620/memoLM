import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq(
    base_url="http://127.0.0.1:8000",
    api_key="memo-key",
)

# Model access is per-API-key, so a hardcoded name is a 404 waiting to happen.
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
knowledge_version = "v12"

print("==================================================")
print("MemoLM Interactive Chat (Powered by Groq)")
print(f"Model: {MODEL}   Knowledge version: {knowledge_version}")
print("Type your message. Type 'exit' to quit.")
print("  'version v13'  -> bump knowledge version (forces a Safety Gate reject)")
print("==================================================")

chat_history = []

while True:
    user_input = input("\nYou: ")
    if user_input.lower() in ["exit", "quit"]:
        break

    # Control command: bump the knowledge version to prove the Safety Gate works.
    if user_input.lower().startswith("version "):
        knowledge_version = user_input.split(maxsplit=1)[1].strip()
        print(f"Knowledge version is now '{knowledge_version}'.")
        continue

    chat_history.append({"role": "user", "content": user_input})
    print("AI: ", end="", flush=True)

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=chat_history,
            stream=True,
            extra_headers={
                "x-memolm-tenant": "acme-corp",
                "x-memolm-version": knowledge_version,
            },
        )
        full_answer = ""
        for chunk in response:
            # The gateway reports its verdict on a terminal frame; anything that
            # is not a normal content delta is a meta/error frame.
            if not chunk.choices:
                continue
            if chunk.choices[0].delta.content is not None:
                text = chunk.choices[0].delta.content
                print(text, end="", flush=True)
                full_answer += text
        print()
        chat_history.append({"role": "assistant", "content": full_answer})

    except Exception as e:
        print(f"\n[Error]: {e}")
