---
"@agentmark-ai/cli": minor
---

Document the `agentmark export traces` CLI feature that was previously missed for versioning.

Commit [`76a049ec`](https://github.com/agentmark-ai/app/commit/76a049ec) *"feat: add CLI `agentmark export traces` command and gateway test coverage"* (Phase 3 of #1819, merged to main on 2026-04-08) added a substantial new CLI command without an accompanying nx version plan, so nx release would not have picked up the change on its own.

This plan retroactively pins a **minor** bump for `@agentmark-ai/cli` because the work is strictly additive feature surface — not a bug fix:

- New command: `agentmark export traces` with flags `--format`, `--score`, `--since`, `--until`, `--limit`, `--dry-run`, `--output`, and filter flags
- New score filter parsing (`correctness>=0.8` → `minScore` query param)
- New dual-auth flow (API key from forwarding config **or** JWT from login)
- New dry-run mode that fetches a 3-row sample and displays a summary
- New file output handling with overwrite protection and stdout piping
- New readable error messages for 400 / 401 / 403 / 429 responses

Strict semver and the existing monorepo convention (see `b579c19f`) both put this at `minor` for new features.
