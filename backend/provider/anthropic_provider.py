"""Anthropic — LangChain ChatAnthropic (package: langchain-anthropic)."""
from typing import Any, ClassVar, Optional
from provider.base import BaseLLMProvider

class AnthropicProvider(BaseLLMProvider):
    name: ClassVar[str] = "anthropic"
    env_prefix: ClassVar[str] = "ANTHROPIC"
    default_model: ClassVar[str] = "claude-sonnet-4-5"

    def _build_chat_model(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> Any:
        from langchain_anthropic import ChatAnthropic
        options = {
            "model": model,
            "anthropic_api_key": api_key or self.config.api_key,
        }
        effective_base_url = base_url or self.config.base_url
        if effective_base_url:
            options["base_url"] = effective_base_url
        return ChatAnthropic(**options)
