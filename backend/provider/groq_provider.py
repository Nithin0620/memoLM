"""Groq — LangChain ChatGroq (package: langchain-groq)."""

from typing import Any, ClassVar

from provider.base import BaseLLMProvider


class GroqProvider(BaseLLMProvider):
    name: ClassVar[str] = "groq"
    env_prefix: ClassVar[str] = "GROQ"
    default_model: ClassVar[str] = "openai/gpt-oss-20b"

    def _build_chat_model(self, model: str) -> Any:
        from langchain_groq import ChatGroq

        options = {
            "model": model,
            "groq_api_key": self.config.api_key,
        }
        if self.config.base_url:
            options["groq_api_base"] = self.config.base_url
        return ChatGroq(**options)
