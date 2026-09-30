"""Google Gemini — LangChain ChatGoogleGenerativeAI (package: langchain-google-genai)."""
from typing import Any, ClassVar, Dict, Optional
from provider.base import DEFAULT_MAX_TOKENS, BaseLLMProvider

class GeminiProvider(BaseLLMProvider):
    name: ClassVar[str] = "gemini"
    env_prefix: ClassVar[str] = "GEMINI"
    default_model: ClassVar[str] = "gemini-2.5-flash"

    def _build_chat_model(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> Any:
        from langchain_google_genai import ChatGoogleGenerativeAI
        options = {
            "model": model,
            "google_api_key": api_key or self.config.api_key,
        }
        effective_base_url = base_url or self.config.base_url
        if effective_base_url:
            options["google_api_url"] = effective_base_url
        return ChatGoogleGenerativeAI(**options)

    def _options(self, temperature: Optional[float], max_tokens: Optional[int]) -> Dict[str, Any]:
        options: Dict[str, Any] = {"max_output_tokens": max_tokens or DEFAULT_MAX_TOKENS}
        if temperature is not None:
            options["temperature"] = temperature
        return options
