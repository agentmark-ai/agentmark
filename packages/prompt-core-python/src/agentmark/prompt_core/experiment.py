"""Concurrency utilities for the experiment runner.

An experiment dispatches N independent dataset rows against a prompt template.
Processing them sequentially makes a run take the *sum* of every row's latency.
A bounded worker pool makes it take roughly
``max-row-latency * ceil(N / concurrency)`` instead.

This is the Python twin of ``@agentmark-ai/prompt-core``'s ``experiment.ts``.

See: https://github.com/agentmark-ai/app/issues/2326
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

#: Dataset rows processed concurrently when the caller doesn't specify.
#:
#: ``agentmark run-experiment --concurrency <n>`` overrides this per run; the
#: dashboard has no override and always uses the default.
DEFAULT_EXPERIMENT_CONCURRENCY = 20

#: Sentinel pushed onto the internal queues to mark end-of-stream.
_DONE = object()


async def run_dataset_pool(
    reader: Any,
    process_item: Callable[[Any, int], Awaitable[str | None]],
    concurrency: int | None = None,
) -> AsyncIterator[str]:
    """Drain a dataset reader through a bounded pool of concurrent workers.

    A single producer reads ``reader`` sequentially (Python's ``DatasetReader``
    gives no concurrency guarantee, so reads are never overlapped) and hands
    each item to a bounded work queue. ``concurrency`` workers drain that queue,
    call ``process_item``, and push results onto a bounded result queue. This
    async generator yields those results **as they complete** — completion
    order, not dataset order. ``index`` is the zero-based read position, stable
    regardless of which worker picks the item up.

    Both queues are bounded to ``concurrency``, so neither the producer nor the
    workers can race ahead and buffer the whole dataset — a slow consumer
    backpressures all the way up to ``reader``.

    ``process_item`` MUST handle its own per-item errors. The experiment policy
    is "emit an error row and continue", so a row failure should be caught
    inside ``process_item`` and surfaced as an error chunk — an exception
    escaping it will abort the whole pool. Returning ``None`` skips the item.

    Args:
        reader: A dataset reader exposing ``await read()`` -> ``{"done", "value"}``.
        process_item: Async callable ``(item, index) -> chunk str | None``.
        concurrency: In-flight cap; defaults to :data:`DEFAULT_EXPERIMENT_CONCURRENCY`.

    Yields:
        NDJSON-ready chunk strings produced by ``process_item``.
    """
    if concurrency is None:
        concurrency = DEFAULT_EXPERIMENT_CONCURRENCY
    # No upper bound — the caller owns the trade-off; only guard against a
    # non-positive value that would stall the pool.
    size = max(1, int(concurrency))

    work_queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=size)
    result_queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=size)

    async def producer() -> None:
        index = 0
        while True:
            read_result = await reader.read()
            if read_result.get("done"):
                break
            await work_queue.put((read_result.get("value", {}), index))
            index += 1
        # One stop signal per worker.
        for _ in range(size):
            await work_queue.put(_DONE)

    async def worker() -> None:
        while True:
            item = await work_queue.get()
            if item is _DONE:
                return
            value, index = item
            chunk = await process_item(value, index)
            if chunk is not None:
                await result_queue.put(chunk)

    async def supervise() -> None:
        try:
            await asyncio.gather(producer(), *(worker() for _ in range(size)))
        finally:
            # Always unblock the consumer, even if a worker raised.
            await result_queue.put(_DONE)

    supervisor = asyncio.create_task(supervise())
    try:
        while True:
            chunk = await result_queue.get()
            if chunk is _DONE:
                break
            yield chunk
        # Re-raise any producer/worker exception now the stream has drained.
        await supervisor
    finally:
        # On an early consumer break, tear the producer/workers down and wait
        # for them to actually unwind before returning.
        if not supervisor.done():
            supervisor.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await supervisor
