# Implementation Plan: Existing Repository Initialization

**Branch**: `006-existing-repo-init` | **Date**: 2026-01-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-existing-repo-init/spec.md`

## Summary

Enable `create-agentmark` to initialize AgentMark in pre-existing TypeScript and Python repositories without breaking existing project configurations. The implementation adds project detection, conflict resolution prompts, file merging strategies (package.json, .gitignore, .env), and package manager detection.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 18+)
**Primary Dependencies**: fs-extra, prompts (already in use by create-agentmark)
**Storage**: N/A (file system operations only)
**Testing**: vitest (existing test framework)
**Target Platform**: Node.js CLI (cross-platform: Windows, macOS, Linux)
**Project Type**: Single package (packages/create-agentmark)
**Performance Goals**: Initialization completes in under 3 minutes
**Constraints**: Must not overwrite existing files without user confirmation
**Scale/Scope**: Support npm, yarn, pnpm package managers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | N/A | Not applicable - CLI tooling |
| II. Adapter Neutrality | N/A | Not applicable - CLI tooling |
| III. Type Safety | PASS | Will use TypeScript with proper types for project detection |
| IV. Testability | PASS | Will add unit tests for detection logic, integration tests for full initialization |
| V. Composability | PASS | Refactor common file operations into reusable utilities |
| VI. Cross-Platform | PASS | Must work on Windows, macOS, Linux; use cross-env, shx as needed |
| Security Standards | PASS | No SQL/external inputs to validate beyond file paths |

**Gate Status**: PASS - All applicable principles satisfied

## Project Structure

### Documentation (this feature)

```text
specs/006-existing-repo-init/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # N/A - no API contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/create-agentmark/
├── src/
│   ├── index.ts                           # Entry point (modify)
│   └── utils/
│       ├── project-detection.ts           # NEW: Detect existing projects
│       ├── package-manager.ts             # NEW: Detect & use correct PM
│       ├── file-merge.ts                  # NEW: Merge strategies
│       ├── conflict-resolution.ts         # NEW: Prompt for conflicts
│       └── examples/
│           ├── create-example-app.ts      # Modify: add existing project support
│           └── create-python-app.ts       # Modify: add existing project support
├── test/
│   ├── unit/
│   │   ├── project-detection.test.ts      # NEW
│   │   ├── package-manager.test.ts        # NEW
│   │   └── file-merge.test.ts             # NEW
│   └── integration/
│       └── existing-repo.test.ts          # NEW: End-to-end tests
└── package.json                           # May need updates
```

**Structure Decision**: Single package modification within existing monorepo structure. New utility modules added under `src/utils/` following existing patterns.

## Complexity Tracking

No complexity violations identified.

---

## Phase Completion Status

| Phase | Status | Artifacts |
|-------|--------|-----------|
| Phase 0: Research | ✅ Complete | [research.md](./research.md) |
| Phase 1: Design | ✅ Complete | [data-model.md](./data-model.md), [quickstart.md](./quickstart.md) |
| Phase 2: Tasks | ✅ Complete | [tasks.md](./tasks.md) |

## Constitution Re-Check (Post-Design)

| Principle | Status | Notes |
|-----------|--------|-------|
| III. Type Safety | ✅ PASS | TypeScript interfaces defined in data-model.md |
| IV. Testability | ✅ PASS | Unit tests planned for each new module |
| V. Composability | ✅ PASS | Reusable utilities in separate modules |
| VI. Cross-Platform | ✅ PASS | Package manager detection supports all platforms |

**Post-Design Gate Status**: PASS - Ready for task generation
