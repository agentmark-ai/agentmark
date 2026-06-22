---
'@agentmark-ai/ui-components': minor
---

Render offloaded media as the span's output instead of a truncated base64 wall.

When an oversized span field (image/audio/large text) is offloaded to object
storage, its inline column keeps only an 8KB preview. The trace drawer used to
render that truncated preview in the output bubble — for media, an unreadable,
clipped base64 string — AND the full value again below under a "Full output"
heading. The duplicated, broken preview read as a bug.

- **OutputDisplay / OutputAccordion**: accept the set of offloaded output fields
  and suppress their truncated inline preview (no base64 wall, no empty
  "No output" bubble). Non-offloaded fields on the same span still render.
- **OffloadedFields**: render media (image/audio) inline with no overline label
  so it reads as the output itself; large text / JSON keep a plain field label
  (`Input` / `Output` / `Output object` / `Tool calls`, no more "Full …").
  Exposes `parseOffloadedFieldNames(blobRefs)` so the preview renderers and the
  offloaded renderer agree on which fields are offloaded.
