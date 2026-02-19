---
'@agentmark-ai/cli': patch
---

Fix pull-models UX: require at least one model selection, show accurate success message, and remove prompt.schema.json auto-generation

- Add `min: 1` to the models multiselect so users can't accidentally confirm with zero selections
- Replace generic "Models pulled successfully." with "Added N model(s): ..." to accurately reflect what changed
- Remove automatic `prompt.schema.json` regeneration from `pull-models` (schema generation was not reliably useful without additional IDE setup)
