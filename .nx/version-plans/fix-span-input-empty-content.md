---
'agentmark-prompt-core': patch
---

Fix `agentmark.input` being dropped from the prompt span when a message is an object (e.g. a Pydantic message) whose content is an empty string. The old accessor fell through to `m.get` on a non-dict message, raising AttributeError that was suppressed — dropping the input for the whole trace and failing `doctor --smoke`'s trace-shape check. Empty-but-present content is now preserved.
