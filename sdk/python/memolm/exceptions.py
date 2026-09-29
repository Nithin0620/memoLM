from typing import Optional, Any, List


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
    """Raised when the MemoLM gateway cannot be reached (connection error or timeout)."""
    pass


class UpstreamProviderError(MemoLMError):
    """Raised when the upstream LLM provider (e.g. Groq, OpenAI) returns an error."""
    pass


class SafetyGateRejectionError(MemoLMError):
    """
    Raised when the MemoLM Safety Gate rejects a request.

    Inspect ``rejection_reasons`` for a list of failed checks
    (e.g. ``["knowledge_version_mismatch", "risk_policy_exceeded"]``).
    """

    def __init__(
        self,
        message: str,
        rejection_reasons: Optional[List[str]] = None,
        status_code: Optional[int] = 400,
        response_body: Optional[Any] = None,
    ) -> None:
        super().__init__(message, status_code=status_code, response_body=response_body)
        self.rejection_reasons: List[str] = rejection_reasons or []

    def __str__(self) -> str:
        base = super().__str__()
        if self.rejection_reasons:
            reasons = ", ".join(self.rejection_reasons)
            return f"{base} (reasons: {reasons})"
        return base


class CacheMissError(MemoLMError):
    """
    Raised when cache_only=True was requested but no safe cache hit was found.
    """
    def __init__(
        self,
        message: str = "Cache miss and cache_only was requested.",
        status_code: Optional[int] = 404,
        response_body: Optional[Any] = None,
    ) -> None:
        super().__init__(message, status_code=status_code, response_body=response_body)
