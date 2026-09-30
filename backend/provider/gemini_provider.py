"""Google Gemini — LangChain ChatGoogleGenerativeAI (package: langchain-google-genai).

Two differences from the other providers, both handled here:
  - the credential field is google_api_key, not api_key
  - the token limit is max_output_tokens, not max_tokens, so _options() is
    overridden rather than passing a parameter the Gemini API would reject
"""

from typing import Any, ClassVar, Dict, Optional

from provider.base import DEFAULT_MAX_TOKENS, BaseLLMProvider


class GeminiProvider(BaseLLMProvider):
    name: ClassVar[str] = "gemini"
    env_prefix: ClassVar[str] = "GEMINI"
    default_model: ClassVar[str] = "gemini-2.5-flash"

    def _build_chat_model(self, model: str) -> Any:
        from langchain_google_genai import ChatGoogleGenerativeAI

        options = {
            "model": model,
            "google_api_key": self.config.api_key,
        }
        if self.config.base_url:
            options["google_api_url"] = self.config.base_url
        return ChatGoogleGenerativeAI(**options)

    def _options(self, temperature: Optional[float], max_tokens: Optional[int]) -> Dict[str, Any]:
        options: Dict[str, Any] = {"max_output_tokens": max_tokens or DEFAULT_MAX_TOKENS}
        if temperature is not None:
            options["temperature"] = temperature
        return options
