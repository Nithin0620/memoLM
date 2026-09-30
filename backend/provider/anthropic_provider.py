"""Anthropic — LangChain ChatAnthropic (package: langchain-anthropic).

Anthropic requires max_tokens on every call. base.DEFAULT_MAX_TOKENS supplies it
when the client omits one, because LangChain's own default of 1024 truncates long
answers silently. The system role is passed as a SystemMessage, which ChatAnthropic
translates to Anthropic's top-level `system` parameter.
"""

from typing import Any, ClassVar

from provider.base import BaseLLMProvider


class AnthropicProvider(BaseLLMProvider):
    name: ClassVar[str] = "anthropic"
    env_prefix: ClassVar[str] = "ANTHROPIC"
    default_model: ClassVar[str] = "claude-sonnet-4-5"

    def _build_chat_model(self, model: str) -> Any:
        from langchain_anthropic import ChatAnthropic

        options = {
            "model": model,
            "anthropic_api_key": self.config.api_key,
        }
        if self.config.base_url:
            options["base_url"] = self.config.base_url
        return ChatAnthropic(**options)
