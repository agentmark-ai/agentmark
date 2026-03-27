"""Dataset sampling utilities for AgentMark prompt-core.

Equivalent to TypeScript's sampling.ts — pure functions for filtering dataset rows
by percentage, specific indices, or train/test splits with optional seeded randomness.
"""

from __future__ import annotations

import ctypes
import math
from typing import Any, TypedDict


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class SplitSpec(TypedDict):
    portion: str  # "train" | "test"
    percentage: int


class SamplingOptions(TypedDict, total=False):
    """Options controlling which dataset rows to process."""

    sample: int
    """Percentage of rows to sample (1-100). Mutually exclusive with rows and split."""

    rows: list[int]
    """Specific row indices to select (0-based, sorted, deduplicated). Mutually exclusive with sample and split."""

    split: SplitSpec
    """Train/test split configuration. Mutually exclusive with sample and rows."""

    seed: int
    """Seed for deterministic random sampling/splitting."""


# ---------------------------------------------------------------------------
# Seeded PRNG (mulberry32-based hash — matches TypeScript implementation)
# ---------------------------------------------------------------------------

def seeded_random(seed: int, index: int) -> float:
    """Return a deterministic float in [0, 1) for a given seed and row index.

    Uses the same mulberry32-based hash as the TypeScript implementation so
    that the same seed + index always produces the same value across runtimes.

    Args:
        seed: Integer seed value.
        index: 0-based row index.

    Returns:
        Float in the range [0, 1).
    """
    # Mirror TypeScript: let h = (seed + index) | 0  (signed 32-bit)
    h = ctypes.c_int32(seed + index).value
    h = ctypes.c_int32(h + 0x6D2B79F5).value

    # Math.imul equivalent using signed 32-bit multiplication
    def imul(a: int, b: int) -> int:
        return ctypes.c_int32(ctypes.c_int32(a).value * ctypes.c_int32(b).value).value

    # Unsigned right shift (mirrors JavaScript's >>> operator)
    def urshift(val: int, n: int) -> int:
        return ctypes.c_uint32(val).value >> n

    t = imul(h ^ urshift(h, 15), 1 | h)
    t = (t + imul(t ^ urshift(t, 7), 61 | t)) ^ t
    return ctypes.c_uint32(t ^ urshift(t, 14)).value / 4294967296.0


# ---------------------------------------------------------------------------
# Row selection parsing
# ---------------------------------------------------------------------------

def parse_row_selection(input_str: str) -> list[int]:
    """Parse a row selection string into a sorted, deduplicated list of indices.

    Args:
        input_str: String like "0,3-5,9".

    Returns:
        Sorted list of unique row indices, e.g. [0, 3, 4, 5, 9].

    Raises:
        ValueError: On empty input, invalid format, or reversed ranges.
    """
    trimmed = input_str.strip()
    if not trimmed:
        raise ValueError("Row selection cannot be empty")

    indices: set[int] = set()

    for token in trimmed.split(","):
        t = token.strip()
        if not t:
            raise ValueError("Row selection contains empty token")

        if "-" in t:
            parts = t.split("-")
            if len(parts) != 2:
                raise ValueError(f'Invalid range format: "{t}"')
            start = _parse_row_index(parts[0].strip(), t)
            end = _parse_row_index(parts[1].strip(), t)
            if start > end:
                raise ValueError(
                    f'Invalid range: start ({start}) is greater than end ({end}) in "{t}"'
                )
            for i in range(start, end + 1):
                indices.add(i)
        else:
            indices.add(_parse_row_index(t, t))

    return sorted(indices)


def _parse_row_index(value: str, context: str) -> int:
    if not value or not value.isdigit():
        raise ValueError(f'Invalid row index: "{value}" in "{context}"')
    num = int(value)
    if num < 0:
        raise ValueError(f"Row index must be non-negative: {num}")
    return num


# ---------------------------------------------------------------------------
# Split spec parsing
# ---------------------------------------------------------------------------

def parse_split_spec(input_str: str) -> SplitSpec:
    """Parse a split specification string.

    Args:
        input_str: String like "train:80" or "test:20".

    Returns:
        SplitSpec dict with "portion" and "percentage" keys.

    Raises:
        ValueError: On invalid format, unknown portion, or out-of-range percentage.
    """
    trimmed = input_str.strip()
    parts = trimmed.split(":")

    if len(parts) != 2:
        raise ValueError(
            f'Invalid split format: expected "train:<percentage>" or "test:<percentage>", got "{trimmed}"'
        )

    portion = parts[0].strip()
    if portion not in ("train", "test"):
        raise ValueError(f'Invalid split portion: expected "train" or "test", got "{portion}"')

    percentage_str = parts[1].strip()
    if not percentage_str.isdigit():
        raise ValueError(f'Invalid split percentage: expected integer 1-99, got "{percentage_str}"')

    percentage = int(percentage_str)
    if percentage < 1 or percentage > 99:
        raise ValueError(f"Split percentage must be between 1 and 99, got {percentage}")

    return {"portion": portion, "percentage": percentage}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_sampling_options(options: SamplingOptions) -> None:
    """Validate sampling options for mutual exclusivity and value ranges.

    Args:
        options: Sampling options to validate.

    Raises:
        ValueError: On invalid or mutually exclusive options.
    """
    modes: list[str] = []
    if "sample" in options:
        modes.append("--sample")
    if "rows" in options:
        modes.append("--rows")
    if "split" in options:
        modes.append("--split")

    if len(modes) > 1:
        raise ValueError(
            "Sampling options are mutually exclusive: only one of --sample, --rows, or --split may be used"
        )

    if "sample" in options:
        sample = options["sample"]
        if not isinstance(sample, int) or sample < 1 or sample > 100:
            raise ValueError("Sample percentage must be an integer between 1 and 100")

    if "rows" in options:
        for row in options["rows"]:
            if row < 0:
                raise ValueError(f"Row index must be non-negative, got {row}")

    if "split" in options:
        split = options["split"]
        if split.get("portion") not in ("train", "test"):
            raise ValueError(
                f'Split portion must be "train" or "test", got "{split.get("portion")}"'
            )
        pct = split.get("percentage", 0)
        if not isinstance(pct, int) or pct < 1 or pct > 99:
            raise ValueError("Split percentage must be an integer between 1 and 99")

    if "seed" in options:
        seed = options["seed"]
        if not isinstance(seed, (int, float)) or not math.isfinite(seed):
            raise ValueError("Seed must be a finite number")


# ---------------------------------------------------------------------------
# Row inclusion predicate
# ---------------------------------------------------------------------------

def should_include_row(
    index: int,
    options: SamplingOptions,
    total_rows: int | None = None,
) -> bool:
    """Determine whether a row at the given index should be included.

    Args:
        index: 0-based row index.
        options: Sampling options.
        total_rows: Total number of rows in the dataset (required for unseeded splits).

    Returns:
        True if the row should be included.

    Raises:
        ValueError: If total_rows is required but not provided.
    """
    if "rows" in options:
        return index in options["rows"]

    if "sample" in options:
        sample = options["sample"]
        if "seed" in options:
            return seeded_random(options["seed"], index) < sample / 100.0
        import random
        return random.random() < sample / 100.0

    if "split" in options:
        split = options["split"]
        if "seed" in options:
            in_train = seeded_random(options["seed"], index) < split["percentage"] / 100.0
            return in_train if split["portion"] == "train" else not in_train
        # Positional split — needs total_rows
        if total_rows is None:
            raise ValueError("total_rows required for unseeded split")
        cutoff = round(total_rows * split["percentage"] / 100.0)
        return (index < cutoff) if split["portion"] == "train" else (index >= cutoff)

    # No sampling mode set — include all rows
    return True


# ---------------------------------------------------------------------------
# Apply sampling to a list of dataset rows
# ---------------------------------------------------------------------------

def apply_sampling(rows: list[Any], options: SamplingOptions) -> list[Any]:
    """Apply sampling to a list of dataset rows.

    This is the Python equivalent of TypeScript's applySampling() for ReadableStream.
    Since Python prompt-core buffers rows in format_with_dataset(), we operate on
    a list directly.

    Args:
        rows: The full list of dataset rows.
        options: Sampling options controlling which rows to include.

    Returns:
        Filtered list containing only the selected rows.

    Raises:
        ValueError: On invalid sampling options.
    """
    validate_sampling_options(options)

    # No sampling mode — return all rows
    if "sample" not in options and "rows" not in options and "split" not in options:
        return rows

    total_rows = len(rows)

    # Validate row indices are in bounds
    if "rows" in options:
        row_set = set(options["rows"])
        for idx in row_set:
            if idx >= total_rows:
                raise ValueError(
                    f"Row index {idx} is out of bounds for dataset with {total_rows} rows"
                )

    # Positional split (unseeded) needs total_rows — already available
    return [
        row
        for i, row in enumerate(rows)
        if should_include_row(i, options, total_rows)
    ]


__all__ = [
    "SamplingOptions",
    "SplitSpec",
    "seeded_random",
    "parse_row_selection",
    "parse_split_spec",
    "validate_sampling_options",
    "should_include_row",
    "apply_sampling",
]
