"""OpenAI — LangChain ChatOpenAI (package: langchain-openai)."""
from typing import Any, ClassVar, Optional
from provider.base import BaseLLMProvider

class OpenAIProvider(BaseLLMProvider):
    name: ClassVar[str] = "openai"
    env_prefix: ClassVar[str] = "OPENAI"
    default_model: ClassVar[str] = "gpt-4o-mini"

    def _build_chat_model(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> Any:
        from langchain_openai import ChatOpenAI
        options = {
            "model": model,
            "api_key": api_key or self.config.api_key,
        }
        effective_base_url = base_url or self.config.base_url
        if effective_base_url:
            options["base_url"] = effective_base_url
        return ChatOpenAI(**options)
