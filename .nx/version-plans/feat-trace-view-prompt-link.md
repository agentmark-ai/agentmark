---
'@agentmark-ai/ui-components': patch
---

Add a "View prompt" link to the trace span header. When a span carries `agentmark.prompt_path` and the host supplies a `promptHref(promptPath, commitSha)` callback on `TraceDrawerProvider`, the prompt name in the span detail header links to the prompt's version page (folder-aware — the flat `promptName` collides across folders, so the path is what uniquely resolves the prompt).

New `extractSpanPromptPath` / `extractSpanCommitSha` helpers read the folder-aware path and served commit from the normalized `data.promptPath` / `data.commitSha`, falling back to the raw `agentmark.prompt_path` / `agentmark.metadata.commit_sha` attributes parsed out of `data.attributes` — so hosts that carry the ClickHouse `SpanAttributes` map (the dashboard) light up the link without promoting a column.
