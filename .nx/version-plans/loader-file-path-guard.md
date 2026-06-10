---
'@agentmark-ai/loader-file': patch
---

fix(loader-file): canonical path-containment guard + NUL-byte rejection

Restructures validateAndResolvePath to the canonical containment check
from CodeQL's js/path-injection guidance — one path.resolve(base, path)
gated by a positive startsWith(base + sep) — replacing the equivalent
but analysis-opaque normalize→join→resolve chain (open alerts 75–78 on
the OSS mirror). Also rejects NUL bytes outright. Behavior is otherwise
unchanged; traversal coverage extended with deep-escape, sibling-prefix
(`base-evil`), and NUL-byte regression tests.
