"""
Retry utilities for the MemoLM SDK.

Retryable status codes: 429 (rate limit), 500 (internal server error), 503 (service unavailable).
Uses exponential backoff with full jitter: sleep = random(0, min(cap, base * 2^attempt)).
"""

import time
import random
import asyncio
import logging
from typing import Optional

logger = logging.getLogger("memolm")

# Status codes that are safe to retry
RETRYABLE_STATUS_CODES = {429, 500, 503}

# Default retry configuration
DEFAULT_MAX_RETRIES = 2
DEFAULT_BACKOFF_BASE = 0.5   # seconds
DEFAULT_BACKOFF_CAP = 8.0    # seconds max sleep


def compute_backoff(attempt: int, base: float = DEFAULT_BACKOFF_BASE, cap: float = DEFAULT_BACKOFF_CAP) -> float:
    """Full jitter exponential backoff: random(0, min(cap, base * 2^attempt))."""
    ceiling = min(cap, base * (2 ** attempt))
    return random.uniform(0, ceiling)


def get_retry_after(headers: dict, default: Optional[float] = None) -> Optional[float]:
    """Parse Retry-After header value (seconds). Returns None if not present or unparseable."""
    value = headers.get("retry-after") or headers.get("Retry-After")
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def should_retry(status_code: int) -> bool:
    return status_code in RETRYABLE_STATUS_CODES


def sleep_before_retry(attempt: int, headers: dict = {}) -> None:
    """Sleep the appropriate amount before a retry attempt."""
    retry_after = get_retry_after(headers)
    if retry_after is not None:
        delay = min(retry_after, DEFAULT_BACKOFF_CAP)
        logger.debug("Retry-After header: sleeping %.2fs before attempt %d", delay, attempt + 1)
    else:
        delay = compute_backoff(attempt)
        logger.debug("Backoff: sleeping %.2fs before attempt %d", delay, attempt + 1)
    time.sleep(delay)


async def async_sleep_before_retry(attempt: int, headers: dict = {}) -> None:
    """Async version of sleep_before_retry."""
    retry_after = get_retry_after(headers)
    if retry_after is not None:
        delay = min(retry_after, DEFAULT_BACKOFF_CAP)
        logger.debug("Retry-After header: sleeping %.2fs before attempt %d", delay, attempt + 1)
    else:
        delay = compute_backoff(attempt)
        logger.debug("Backoff: sleeping %.2fs before attempt %d", delay, attempt + 1)
    await asyncio.sleep(delay)
