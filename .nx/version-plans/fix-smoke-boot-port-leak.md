---
'@agentmark-ai/cli': minor
---

Onboarding-smoke fixes:

- **`doctor --smoke --boot` no longer leaks a server process.** `killProcessTree` ran `pkill -KILL -P <pid>` on Unix, which reaches only *direct* children — so `agentmark dev`'s `tsx --watch` worker (a grandchild that owns the webhook port) was orphaned, leaking port 9417 after a run and across repeated runs. The Unix path now walks the tree leaf-first via `pgrep -P` and SIGKILLs every descendant, matching the `taskkill /T` behavior already used on Windows.

- **`doctor`'s JSON `ok` now reflects `--strict`** (behavior change; may affect consumers). Previously `ok` meant "no failures" and ignored `--strict`, so with `--strict` and only warnings present the process exited 1 while the JSON still reported `ok: true`. `ok` now matches the exit code: failures always fail; warnings fail only under `--strict`. A new exported `isOk(counts, strict)` is the single source of truth for both.

- Fix a stale docs URL printed by `pull-models` (`/integrations/bring-your-own-sdk` → `/configure/connect-your-sdk`).
