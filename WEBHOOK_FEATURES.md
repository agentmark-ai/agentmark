# Webhook Helper vs Runner Feature Parity

## Webhook Helper supported features
- [ ] Text prompt run with streaming (emits text-delta/tool-call/finish + usage)
- [ ] Text prompt run without streaming (returns full text, tool calls/results, usage, finishReason)
- [ ] Object prompt run with streaming (emits object chunks + final usage)
- [ ] Object prompt run without streaming (returns full object, usage, finishReason)
- [ ] Image prompt run (returns array of images with mimeType/base64)
- [ ] Speech prompt run (returns audio with mimeType/base64/format)
- [ ] Dataset run for text prompts (iterates dataset, executes model per row, emits JSONL chunks including input/expected/actual/tokens/evals, telemetry metadata)
- [ ] Dataset run for object prompts (same as text, with object actual)
- [ ] Evaluation hooks per dataset row (resolves evaluators from registry, returns name/score/label/reason)
- [ ] Telemetry propagation on dataset rows (adds dataset_run_id/path/runName/item index/traceName/traceId/expected into experimental_telemetry.metadata)

## Runner currently supported features
- [x] Text prompt run with streaming (emits text-delta/tool-call/finish + usage)
- [x] Text prompt run without streaming (returns full text, tool calls/results, usage, finishReason)
- [x] Object prompt run with streaming (emits object chunks + final usage)
- [x] Object prompt run without streaming (returns full object, usage, finishReason)
- [x] Image prompt run (returns array of images with mimeType/base64)
- [x] Speech prompt run (returns audio with mimeType/base64/format)
- [x] Dataset run for text prompts (iterates dataset, executes model per row, emits JSONL chunks including input/expected/actual/tokens/evals, telemetry metadata)
- [x] Dataset run for object prompts (same as text, with object actual)
- [x] Evaluation hooks per dataset row (resolves evaluators from registry, returns name/score/label/reason)
- [x] Telemetry propagation on dataset rows (adds dataset_run_id/path/runName/item index/traceName/traceId/expected into experimental_telemetry.metadata)

