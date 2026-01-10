# Implementation Plan: Windows Compatibility

**Branch**: `004-windows-compatibility` | **Date**: 2026-01-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-windows-compatibility/spec.md`

## Summary

Enable Windows developers to clone, install, build, test, and develop on the AgentMark repository without platform-specific errors. The approach uses cross-platform npm packages and Node.js scripts to replace Unix-specific shell commands, with PowerShell/Node.js equivalents for bash scripts used in development automation.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+, Python 3.8+
**Primary Dependencies**: cross-env (env vars), shx (shell commands)
**Storage**: N/A
**Testing**: vitest, pytest
**Target Platform**: Windows 10+, macOS, Linux (cross-platform)
**Project Type**: Monorepo with multiple packages
**Performance Goals**: N/A (build tooling)
**Constraints**: Must work on PowerShell, Command Prompt, and Git Bash
**Scale/Scope**: 8+ package.json files, 5+ bash scripts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | ✅ PASS | No impact on prompt files |
| II. Adapter Neutrality | ✅ PASS | No impact on adapters |
| III. Type Safety | ✅ PASS | No type changes required |
| IV. Testability | ✅ PASS | Tests must pass on all platforms |
| V. Composability | ✅ PASS | No impact on prompt composition |

**Security Standards**: ✅ PASS - No database or input validation changes

## Project Structure

### Documentation (this feature)

```text
specs/004-windows-compatibility/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A (no data models)
├── quickstart.md        # Phase 1 output
├── contracts/           # N/A (no API contracts)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Files requiring modification

# Root
package.json                 # ENV variable syntax fix

# TypeScript packages (chmod/build fixes)
packages/cli/package.json
packages/create-agentmark/package.json
packages/mcp-server/package.json

# Python packages (venv path fixes)
packages/sdk-python/package.json
packages/templatedx-python/package.json
packages/prompt-core-python/package.json
packages/pydantic-ai-v0-adapter/package.json

# Shell scripts (need cross-platform alternatives)
.specify/scripts/bash/common.sh
.specify/scripts/bash/setup-plan.sh
.specify/scripts/bash/check-prerequisites.sh
.specify/scripts/bash/update-agent-context.sh
.specify/scripts/bash/create-new-feature.sh
packages/mcp-server/scripts/seed-test-data.sh

# CI/CD
.github/workflows/ci.yml     # Add Windows to test matrix
```

**Structure Decision**: Modifications to existing files across the monorepo. No new directories required except optional `.specify/scripts/node/` for Node.js equivalents of bash scripts.

## Complexity Tracking

> No constitution violations - complexity is necessary for cross-platform support.

| Pattern | Why Needed | Simpler Alternative Rejected Because |
|---------|------------|-------------------------------------|
| cross-env package | Cross-platform env vars | Native syntax differs between shells |
| Node.js scripts for bash | Cross-platform automation | Bash scripts don't run on Windows |
| Platform detection in Python scripts | Different venv paths | Python venv structure differs by OS |
