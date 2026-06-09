---
'@agentmark-ai/cli': minor
---

fix(doctor): remove obsolete adapter dependency checks

SDK-specific adapters are being removed from AgentMark — there is no
`@agentmark-ai/*-adapter` to require, and your model SDK is your own choice. So
`agentmark doctor` drops two now-meaningless checks:

- `deps.adapter` — previously warned when no `@agentmark-ai/*-adapter` was
  installed ("prompts need one to run end-to-end"). Untrue now: prompts run
  through the neutral render plus your SDK, or an executor.
- `deps.provider` — the AI-SDK-adapter ↔ `@ai-sdk/*` provider major-version
  coherence sub-check. Moot without an adapter.

`deps.sdk` (is `@agentmark-ai/sdk` installed, for tracing + the cloud-execution
runner) stays. `doctor --smoke` remains the end-to-end proof that a prompt
actually runs. **Contract note:** the `--json` `results[].id` set no longer
includes `deps.adapter` / `deps.provider`; consumers that branched on them should
stop. The live `doctor --json` output is the authority for the current id set.
