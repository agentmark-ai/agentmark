---
'@agentmark-ai/ui-components': patch
'@agentmark-ai/cli': patch
---

Trace → dataset conversion now defaults a dataset row's `input` to the prompt's template **variables** (props) instead of the rendered chat messages — across the trace viewer's "Add to dataset" (ui-components `extractSpanInput` / `getSpanInputKind`) and the CLI's local `import_dataset_rows_from_traces` (`api-server`).

A dataset row must be re-runnable: `run-experiment` feeds `row.input` back as props, so the variables are the canonical input — the rendered messages can't re-render the template. This matches how prompt-as-code eval tools store test inputs (Promptfoo `vars`, Braintrust/LangSmith template inputs) and the OpenInference distinction between `llm.input_messages` (rendered) and `llm.prompt_template.variables`. The rendered messages remain the fallback for spans that carry no variables (a raw chat call with no template). Previously props were preferred only for `invoke_agent` spans, so GENERATION spans fell through to the messages branch.
