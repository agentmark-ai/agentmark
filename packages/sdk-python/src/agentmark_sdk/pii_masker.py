"""Pre-built PII masker with common regex patterns."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Sequence

from .masking_processor import MaskFunction


@dataclass
class CustomPattern:
    """A user-defined regex pattern for PII masking."""

    pattern: re.Pattern[str]
    replacement: str


@dataclass
class PiiMaskerConfig:
    """Configuration for the built-in PII masker."""

    email: bool = False
    phone: bool = False
    ssn: bool = False
    credit_card: bool = False
    ip_address: bool = False
    custom: Sequence[CustomPattern] = field(default_factory=list)


@dataclass
class _PatternEntry:
    regex: re.Pattern[str]
    replacement: str


_PATTERNS: dict[str, _PatternEntry] = {
    "email": _PatternEntry(
        regex=re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
        replacement="[EMAIL]",
    ),
    "phone": _PatternEntry(
        regex=re.compile(r"(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
        replacement="[PHONE]",
    ),
    "ssn": _PatternEntry(
        regex=re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        replacement="[SSN]",
    ),
    "credit_card": _PatternEntry(
        regex=re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
        replacement="[CREDIT_CARD]",
    ),
    "ip_address": _PatternEntry(
        regex=re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
        replacement="[IP_ADDRESS]",
    ),
}

# Order matters: longer/more-specific patterns first to prevent partial matches
# (e.g., credit card must run before phone, or the phone regex eats 10 digits of a CC number)
_PATTERN_ORDER: list[str] = ["credit_card", "ssn", "email", "phone", "ip_address"]


def create_pii_masker(config: PiiMaskerConfig | None = None, **kwargs: bool) -> MaskFunction:
    """Create a mask function that redacts common PII patterns.

    Can be called with a config object or keyword arguments:

        create_pii_masker(PiiMaskerConfig(email=True, phone=True))
        create_pii_masker(email=True, phone=True)

    Args:
        config: PiiMaskerConfig with pattern flags and optional custom patterns.
        **kwargs: Shorthand for pattern flags (email, phone, ssn, credit_card, ip_address).

    Returns:
        A synchronous mask function ``(str) -> str``.
    """
    if config is None:
        config = PiiMaskerConfig(**kwargs)  # type: ignore[arg-type]

    active: list[_PatternEntry] = []

    for pattern_key in _PATTERN_ORDER:
        if getattr(config, pattern_key, False) and pattern_key in _PATTERNS:
            active.append(_PATTERNS[pattern_key])

    for entry in config.custom:
        active.append(_PatternEntry(regex=entry.pattern, replacement=entry.replacement))

    def _mask(data: str) -> str:
        result = data
        for p in active:
            result = p.regex.sub(p.replacement, result)
        return result

    return _mask
