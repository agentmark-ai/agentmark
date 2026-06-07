---
'@agentmark-ai/templatedx': patch
---

fix(templatedx): recover the position of unclosed-tag-at-EOF parse errors

`mdast-util-mdx-jsx` raises "Expected a closing tag for `<X>` (L:C-L:C)" when
a document ends while a flow-level JSX tag is still open — and in exactly that
branch it constructs the `VFileMessage` with no structured position, putting
the opening tag's range in the message text only. Editors mapping errors to
squiggles then fell back to flagging line 1 — the opposite end of the file
from the unclosed tag. `parse()` now recovers the `(L:C[-L:C])` range from the
message and repairs the error's `place`/`line`/`column` in place (including
0-based offsets computed against the source), so every parse error is
positioned. Recovery is scoped structurally to that one error family via the
`VFileMessage` origin fields (`source`/`ruleId`) before any message text is
read; errors that already carry a structured position are never overridden;
messages and error types are unchanged. (Verified against upstream 3.2.0/main:
no released or unreleased fix exists, and the compile context holding the tag
stack is unreachable from any extension hook — the official MDX language
server anchors this same error at line 0.)
