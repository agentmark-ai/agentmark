"""create_agentmark_span_hooks — the shared WebhookRunner span hooks.

Python counterpart of the TS ``createAgentmarkSpanHooks()``: the one call that
makes ``create_webhook_runner`` (and the adapters) trace every run and
experiment item. The hooks take the runner's per-call params duck-typed, so a
plain namespace stands in for ``PromptSpanParams`` / ``ExperimentItemParams``.
"""

from __future__ import annotations

from types import SimpleNamespace

from agentmark_sdk import create_agentmark_span_hooks


def test_returns_both_runner_hooks() -> None:
    hooks = create_agentmark_span_hooks()
    assert set(hooks) == {"prompt_span_hook", "item_span_hook"}


async def test_prompt_span_yields_an_annotatable_ctx() -> None:
    hooks = create_agentmark_span_hooks()
    params = SimpleNamespace(name="run", prompt_name="greeting")
    async with hooks["prompt_span_hook"](params) as ctx:
        assert hasattr(ctx, "trace_id")
        ctx.set_attribute("k", "v")  # must not raise


async def test_prompt_span_forwards_commit_sha_and_prompt_name() -> None:
    """Prompt-version linking: the prompt hook must build SpanOptions with
    prompt_name AND metadata={"commit_sha": ...} (same key the item hook
    emits), so regular runs link traces to the exact prompt version."""
    import agentmark_sdk.span_hooks as span_hooks_mod
    from contextlib import asynccontextmanager

    captured: list[object] = []

    @asynccontextmanager
    async def fake_span_context(options):  # type: ignore[no-untyped-def]
        captured.append(options)

        class _Ctx:
            trace_id = "abc123abc123abc123abc123abc123ab"

            def set_attribute(self, key: str, value: str) -> None:
                pass

        yield _Ctx()

    original = span_hooks_mod.span_context
    span_hooks_mod.span_context = fake_span_context
    try:
        hooks = create_agentmark_span_hooks()
        params = SimpleNamespace(
            name="greet-run",
            prompt_name="greet",
            commit_sha="abc123def456",
            prompt_path="agentmark/support/triage.prompt.mdx",
        )
        async with hooks["prompt_span_hook"](params):
            pass
    finally:
        span_hooks_mod.span_context = original

    assert len(captured) == 1
    options = captured[0]
    assert options.name == "greet-run"  # type: ignore[attr-defined]
    assert options.prompt_name == "greet"  # type: ignore[attr-defined]
    assert (  # type: ignore[attr-defined]
        options.prompt_path == "agentmark/support/triage.prompt.mdx"
    )
    assert options.metadata == {"commit_sha": "abc123def456"}  # type: ignore[attr-defined]


async def test_prompt_span_omits_metadata_without_commit_sha() -> None:
    """Params predating the commit_sha field (duck-typed) must not emit a
    metadata dict at all."""
    import agentmark_sdk.span_hooks as span_hooks_mod
    from contextlib import asynccontextmanager

    captured: list[object] = []

    @asynccontextmanager
    async def fake_span_context(options):  # type: ignore[no-untyped-def]
        captured.append(options)

        class _Ctx:
            trace_id = ""

            def set_attribute(self, key: str, value: str) -> None:
                pass

        yield _Ctx()

    original = span_hooks_mod.span_context
    span_hooks_mod.span_context = fake_span_context
    try:
        hooks = create_agentmark_span_hooks()
        # No commit_sha attribute at all — older prompt-core PromptSpanParams.
        params = SimpleNamespace(name="run", prompt_name="greeting")
        async with hooks["prompt_span_hook"](params):
            pass
    finally:
        span_hooks_mod.span_context = original

    assert captured[0].metadata is None  # type: ignore[attr-defined]
    assert captured[0].prompt_name == "greeting"  # type: ignore[attr-defined]


async def test_item_span_maps_dataset_params_without_error() -> None:
    # Exercises the dataset-field mapping (json.dumps of expected/input + the
    # commit_sha metadata branch), the part most likely to drift.
    hooks = create_agentmark_span_hooks()
    params = SimpleNamespace(
        dataset_run_name="exp",
        index=0,
        prompt_name="greeting",
        experiment_run_id="run-1",
        dataset_item_name="item-0",
        dataset_expected_output={"ok": True},
        dataset_input={"q": "hi"},
        dataset_path="data/x.jsonl",
        commit_sha="abc",
    )
    async with hooks["item_span_hook"](params) as ctx:
        assert hasattr(ctx, "trace_id")
        ctx.set_attribute("k", "v")
