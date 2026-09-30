import os

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI

load_dotenv()

# This talks to the MemoLM gateway, not an LLM vendor. The gateway exposes an
# OpenAI-compatible /v1/chat/completions, so ChatOpenAI aimed at localhost is the
# right client. Upstream Groq is reached separately by provider/groq_provider.py
# via langchain-groq, which is why this file does not import the groq SDK.
GATEWAY_URL = "http://127.0.0.1:8000/v1"

# Model access is per-API-key, so a hardcoded name is a 404 waiting to happen.
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
TENANT = os.getenv("MEMOLM_TENANT", "acme-corp")
knowledge_version = "v12"

# Headers bind at construction and the `version` command below changes the
# knowledge version mid-session, so clients are memoized per version.
_clients = {}


def _client(version: str) -> ChatOpenAI:
    if version not in _clients:
        _clients[version] = ChatOpenAI(
            base_url=GATEWAY_URL,
            api_key="memo-key",
            model=MODEL,
            default_headers={
                "x-memolm-tenant": TENANT,
                "x-memolm-version": version,
            },
        )
    return _clients[version]


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

    chat_history.append(HumanMessage(content=user_input))
    print("AI: ", end="", flush=True)

    full_answer = ""
    try:
        for chunk in _client(knowledge_version).stream(chat_history):
            # The gateway emits a terminal meta frame carrying the verdict; only
            # content deltas belong to the answer.
            text = chunk.content
            if text:
                print(text, end="", flush=True)
                full_answer += text
        print()
    except Exception as e:
        print(f"\n[Error]: {e}")

    if full_answer:
        chat_history.append(AIMessage(content=full_answer))
    else:
        # Failed or empty turn: drop the question rather than send a dangling
        # user message with no answer on the next turn.
        chat_history.pop()
