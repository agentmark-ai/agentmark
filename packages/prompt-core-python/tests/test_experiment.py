"""Tests for the experiment-runner concurrency utilities.

Mirrors the TypeScript suite in ``@agentmark-ai/prompt-core``'s
``experiment.test.ts``.
"""

from __future__ import annotations

import asyncio
from typing import Any

from agentmark.prompt_core.experiment import (
    DEFAULT_EXPERIMENT_CONCURRENCY,
    run_dataset_pool,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _ListReader:
    """A minimal dataset reader backed by an in-memory list.

    Exposes ``await read()`` -> ``{"done": bool, "value": item}`` exactly like
    the ``DatasetReader`` contract ``run_dataset_pool`` expects.
    """

    def __init__(self, items: list[Any]) -> None:
        self._items = items
        self._i = 0

    async def read(self) -> dict[str, Any]:
        if self._i >= len(self._items):
            return {"done": True}
        item = self._items[self._i]
        self._i += 1
        return {"done": False, "value": item}


async def _collect(agen: Any) -> list[Any]:
    """Drain an async generator into a list."""
    out: list[Any] = []
    async for chunk in agen:
        out.append(chunk)
    return out


# ---------------------------------------------------------------------------
# run_dataset_pool
# ---------------------------------------------------------------------------


class TestRunDatasetPool:
    async def test_processes_every_item_and_yields_each_result(self) -> None:
        items = [f"row-{i}" for i in range(7)]
        reader = _ListReader(items)

        async def process_item(item: str, index: int) -> str:
            return f"item-{index}:{item}"

        results = await _collect(run_dataset_pool(reader, process_item, concurrency=3))

        assert len(results) == 7
        assert sorted(results) == sorted(f"item-{i}:row-{i}" for i in range(7))

    async def test_yields_nothing_for_empty_reader(self) -> None:
        reader = _ListReader([])

        async def process_item(item: Any, index: int) -> str:
            return f"item-{index}"

        results = await _collect(run_dataset_pool(reader, process_item, concurrency=3))

        assert results == []

    async def test_skips_items_whose_process_item_returns_none(self) -> None:
        items = list(range(8))
        reader = _ListReader(items)

        async def process_item(item: int, index: int) -> str | None:
            # Drop the even-valued items by returning None.
            if item % 2 == 0:
                return None
            return f"item-{item}"

        results = await _collect(run_dataset_pool(reader, process_item, concurrency=3))

        assert sorted(results) == ["item-1", "item-3", "item-5", "item-7"]

    async def test_respects_concurrency_cap_and_actually_overlaps(self) -> None:
        items = list(range(12))
        reader = _ListReader(items)

        in_flight = 0
        max_in_flight = 0

        async def process_item(item: int, index: int) -> str:
            nonlocal in_flight, max_in_flight
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return f"item-{index}"

        results = await _collect(run_dataset_pool(reader, process_item, concurrency=4))

        assert len(results) == 12
        assert max_in_flight == 4

    async def test_honors_concurrency_with_no_upper_bound(self) -> None:
        items = list(range(25))
        reader = _ListReader(items)

        in_flight = 0
        max_in_flight = 0

        async def process_item(item: int, index: int) -> str:
            nonlocal in_flight, max_in_flight
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return f"item-{index}"

        results = await _collect(run_dataset_pool(reader, process_item, concurrency=25))

        assert len(results) == 25
        # No clamp — concurrency well above the former ceiling of 20 is honored.
        assert max_in_flight == 25

    async def test_processes_all_items_without_deadlock_when_concurrency_is_0(self) -> None:
        items = list(range(3))
        reader = _ListReader(items)

        in_flight = 0
        max_in_flight = 0

        async def process_item(item: int, index: int) -> str:
            nonlocal in_flight, max_in_flight
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
            await asyncio.sleep(0.005)
            in_flight -= 1
            return f"item-{index}"

        results = await _collect(run_dataset_pool(reader, process_item, concurrency=0))

        assert len(results) == 3
        assert max_in_flight == 1

    async def test_uses_default_concurrency_when_not_specified(self) -> None:
        items = list(range(6))
        reader = _ListReader(items)

        async def process_item(item: int, index: int) -> str:
            return f"item-{index}"

        results = await _collect(run_dataset_pool(reader, process_item))

        assert sorted(results) == sorted(f"item-{i}" for i in range(6))


# ---------------------------------------------------------------------------
# constants
# ---------------------------------------------------------------------------


class TestExperimentConstants:
    def test_default_experiment_concurrency_is_20(self) -> None:
        assert DEFAULT_EXPERIMENT_CONCURRENCY == 20
