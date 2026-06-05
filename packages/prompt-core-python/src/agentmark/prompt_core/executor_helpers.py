"""Cross-adapter executor primitives — Python counterpart to
``prompt-core/src/executor-helpers.ts``.

These helpers codify invariants every adapter needs but know nothing about
any specific SDK's field names. SDK-specific field mapping
(``usage.prompt_tokens`` vs ``usage.inputTokens`` vs ``RunUsage``) happens
inside each adapter — the result of that mapping is the input to these
helpers.

Parity: byte-compatible with the TS counterpart. Both are exercised by the
shared ``conformance-vectors`` fixture set.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from .executor import UsageData

__all__ = ["finalize_usage", "normalize_error"]


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def finalize_usage(
    input_tokens: int | float | None,
    output_tokens: int | float | None,
    total_tokens: int | float | None = None,
) -> UsageData | None:
    """Fill in ``total_tokens`` from ``input + output`` when the provider
    doesn't report it. Returns ``None`` when all three inputs are falsy
    (no signal at all). Mirrors TS ``finalizeUsage``.
    """
    if input_tokens is None and output_tokens is None and total_tokens is None:
        return None
    input_t = int(input_tokens) if _is_finite_number(input_tokens) else 0
    output_t = int(output_tokens) if _is_finite_number(output_tokens) else 0
    total_t = int(total_tokens) if _is_finite_number(total_tokens) else input_t + output_t
    return UsageData(
        input_tokens=input_t,
        output_tokens=output_t,
        total_tokens=total_t,
    )


def normalize_error(error: Any) -> str:
    """Canonicalize an arbitrary exception/object into a human-readable
    string. Mirrors TS ``normalizeError``.
    """
    if error is None or error == "":
        return "Unknown error"
    if isinstance(error, str):
        return error
    if isinstance(error, BaseException):
        message = str(error)
        return message or type(error).__name__
    if isinstance(error, dict):
        msg = error.get("message")
        if msg:
            return str(msg)
        nested = error.get("error")
        if isinstance(nested, dict) and nested.get("message"):
            return str(nested["message"])
        data = error.get("data")
        if isinstance(data, dict):
            data_error = data.get("error")
            if isinstance(data_error, dict) and data_error.get("message"):
                return str(data_error["message"])
        import json
        try:
            return json.dumps(error, default=str)
        except (TypeError, ValueError):
            return str(error)
    if hasattr(error, "message"):
        try:
            message = getattr(error, "message")
            if message:
                return str(message)
        except Exception:
            pass
    return str(error)
