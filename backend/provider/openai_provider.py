"""OpenAI — LangChain ChatOpenAI (package: langchain-openai).

ChatOpenAI also fronts any OpenAI-compatible endpoint (vLLM, LM Studio, OpenRouter,
Together, NVIDIA NIM). Point OPENAI_BASE_URL at one and it works unchanged.
"""

from typing import Any, ClassVar

from provider.base import BaseLLMProvider


class OpenAIProvider(BaseLLMProvider):
    name: ClassVar[str] = "openai"
    env_prefix: ClassVar[str] = "OPENAI"
    default_model: ClassVar[str] = "gpt-4o-mini"

    def _build_chat_model(self, model: str) -> Any:
        from langchain_openai import ChatOpenAI

        options = {
            "model": model,
            "api_key": self.config.api_key,
        }
        if self.config.base_url:
            options["base_url"] = self.config.base_url
        return ChatOpenAI(**options)
