from typing import Optional, Any

class MemoLMError(Exception):
    """Base exception for all MemoLM SDK errors."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response_body: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.response_body = response_body

    def __str__(self) -> str:
        if self.status_code:
            return f"[{self.status_code}] {self.message}"
        return self.message


class GatewayUnavailableError(MemoLMError):
    """Raised when the MemoLM gateway cannot be reached."""
    pass


class UpstreamProviderError(MemoLMError):
    """Raised when the upstream LLM provider (e.g. Groq, OpenAI) returns an error."""
    pass
