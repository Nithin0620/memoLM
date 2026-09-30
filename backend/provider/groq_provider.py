"""Groq — LangChain ChatGroq (package: langchain-groq)."""
from typing import Any, ClassVar, Optional
from provider.base import BaseLLMProvider

class GroqProvider(BaseLLMProvider):
    name: ClassVar[str] = "groq"
    env_prefix: ClassVar[str] = "GROQ"
    default_model: ClassVar[str] = "openai/gpt-oss-20b"

    def _build_chat_model(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> Any:
        from langchain_groq import ChatGroq
        options = {
            "model": model,
            "groq_api_key": api_key or self.config.api_key,
        }
        effective_base_url = base_url or self.config.base_url
        if effective_base_url:
            options["groq_api_base"] = effective_base_url
        return ChatGroq(**options)
