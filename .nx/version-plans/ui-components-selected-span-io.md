---
'@agentmark-ai/ui-components': patch
---

fix(ui-components): export useSelectedSpanIO so hosts can hydrate lazy span IO

Extracts the trace drawer's lazy span-IO hydration (host-provided
fetchSpanIO, synthetic trace-root → real root-span resolution, per-span
caching) out of useSpanPrompts into a reusable, exported
useSelectedSpanIO hook. Hosts that load traces "lightweight" (IO columns
stripped from the initial fetch) and read input/output off the selected
span outside the IO tab — e.g. the dashboard's Add-to-Dataset capture —
previously saw empty strings (agentmark-ai/app#2785). mergeSpanIO moved
with it and is re-exported from its old module; behavior is unchanged.
