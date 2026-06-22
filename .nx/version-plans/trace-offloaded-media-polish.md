---
'@agentmark-ai/ui-components': patch
---

Polish offloaded-media rendering in the trace drawer (follow-up to the
size-driven blob offload).

- **Label parity with the inline output bubble.** An offloaded field now uses
  the same header label as the non-offloaded case via the host `t()`: `Output`
  → "Assistant" (the generation's response), `OutputObject` → "Output",
  `ToolCalls` → "Tool", `Input` → "Input". Previously it showed the raw column
  name ("Output"), so the same text completion read as "Output" when offloaded
  but "Assistant" when inline.
- **Zoom is gated on overflow.** Click-to-zoom (and the cursor) now appear only
  when the image is actually downscaled to fit the cap; a small image that
  already shows 1:1 is no longer "zoomable" (no misleading zoom cursor that did
  nothing). When zoomable, a discoverable "Expand" affordance is shown.
- **Framed, captioned image.** The image renders in a bordered, checkerboard
  container (transparent PNGs are visible, small images no longer float in dead
  white space) with a caption: `mediaType · width×height · size`.
