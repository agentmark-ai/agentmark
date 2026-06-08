---
'create-agentmark': minor
---

feat(create-agentmark): --yes non-interactive mode and --help usage

Headless onboarding stops at step zero without this: the init blocked on
TTY prompts no CI job or coding agent can answer, and with no --help the
existing escape hatches (--path, --client, --overwrite) were
undiscoverable. `--yes` (`-y`) accepts the interactive default for every
prompt — target folder (`.` inside an existing project, else
my-agentmark-app), all four IDE clients, keep an existing agentmark.json
(--overwrite stays the explicit opt-in). `--help` (`-h`) prints the flag
surface. `npx create-agentmark --yes` with stdin closed now completes the
full init unattended.
