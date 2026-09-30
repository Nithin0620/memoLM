"""
Provider registry.

One entry per supported upstream, resolved by name at request time. A request may
name a provider and a model; the credential and base URL always come from the
server's own environment, never from the request.

Instances are cached so each provider's chat models (and their HTTP connection
pools) are built once and reused.
"""

from typing import Dict, List, Optional, Type

from provider.base import (
    DEFAULT_MAX_TOKENS,
    BaseLLMProvider,
    ProviderConfig,
    ProviderError,
    ProviderNotConfigured,
    ProviderNotFound,
)
from provider.anthropic_provider import AnthropicProvider
from provider.gemini_provider import GeminiProvider
from provider.groq_provider import GroqProvider
from provider.openai_provider import OpenAIProvider

PROVIDER_CLASSES: Dict[str, Type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "groq": GroqProvider,
}

# Names people reasonably type, mapped onto the canonical ids.
PROVIDER_ALIASES: Dict[str, str] = {
    "google": "gemini",
    "google_genai": "gemini",
    "google-genai": "gemini",
    "googleai": "gemini",
    "claude": "anthropic",
}

_instances: Dict[str, BaseLLMProvider] = {}


def canonical_provider_name(name: str) -> str:
    key = (name or "").strip().lower()
    return PROVIDER_ALIASES.get(key, key)


def list_providers() -> List[str]:
    return sorted(PROVIDER_CLASSES.keys())


def get_provider(name: str) -> BaseLLMProvider:
    """Return the cached provider instance, or raise ProviderNotFound /
    ProviderNotConfigured. Never returns a partially usable provider."""
    key = canonical_provider_name(name)
    provider_class = PROVIDER_CLASSES.get(key)
    if provider_class is None:
        raise ProviderNotFound(
            f"Unknown provider '{name}'. Available: {', '.join(list_providers())}."
        )

    if key not in _instances:
        try:
            _instances[key] = provider_class()
        except ProviderNotConfigured:
            raise
        except Exception as exc:  # import failure, bad key format, etc.
            raise ProviderError(
                f"Provider '{key}' failed to initialize: {exc}"
            ) from exc
    return _instances[key]


def describe_providers() -> List[Dict[str, object]]:
    """Non-secret availability summary, for error messages and diagnostics."""
    summary = []
    for key in list_providers():
        config = ProviderConfig(key, PROVIDER_CLASSES[key].env_prefix,
                                PROVIDER_CLASSES[key].default_model)
        summary.append({
            "provider": key,
            "configured": config.is_configured,
            "default_model": config.model,
        })
    return summary


def resolve_provider(name: Optional[str], default: str) -> BaseLLMProvider:
    """Registry entry point used by the gateway: fall back to `default`, then
    raise with a message naming the valid options."""
    chosen = (name or "").strip() or default
    try:
        return get_provider(chosen)
    except ProviderNotFound as exc:
        raise ProviderNotFound(
            f"{exc} (default provider is '{default}')"
        ) from exc


__all__ = [
    "DEFAULT_MAX_TOKENS",
    "BaseLLMProvider",
    "ProviderConfig",
    "ProviderError",
    "ProviderNotConfigured",
    "ProviderNotFound",
    "canonical_provider_name",
    "describe_providers",
    "get_provider",
    "list_providers",
    "resolve_provider",
]
