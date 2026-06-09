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
