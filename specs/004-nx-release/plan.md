# Implementation Plan: Replace Changeset with Nx Release

**Branch**: `004-nx-release` | **Date**: 2026-01-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-nx-release/spec.md`

## Summary

Replace the Changeset-based release workflow with Nx Release using Version Plans. The core change enables file-based version bump tracking (similar to changeset files) via `.nx/version-plans/` directory, with CI validation to ensure changed packages have version plans. This solves the peer dependency major bump escalation issue while maintaining familiar PR-based release workflow.

## Technical Context

**Language/Version**: Node.js 21 (GitHub Actions), TypeScript 5.x (monorepo packages)
**Primary Dependencies**: nx ^20.4.0 (already installed), @changesets/cli (to be removed)
**Storage**: N/A (file-based version plans in `.nx/version-plans/`)
**Testing**: Manual workflow testing, CI validation via `nx release plan:check`
**Target Platform**: GitHub Actions (ubuntu-latest runners)
**Project Type**: Monorepo tooling/CI configuration
**Performance Goals**: Release workflow completes within 5 minutes (SC-002)
**Constraints**: Must work with existing yarn workspaces, independent package versioning
**Scale/Scope**: ~15 packages in monorepo, multiple concurrent contributors

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | ✅ Pass | Version plan files are markdown with YAML front matter |
| II. Adapter Neutrality | ✅ N/A | This is CI/CD tooling, not runtime code |
| III. Type Safety | ✅ N/A | Configuration files, no TypeScript types needed |
| IV. Testability | ✅ Pass | Dry-run mode enables testing, CI validation enforces version plans |
| V. Composability | ✅ N/A | Not applicable to release workflow |
| Release Process (Technology Standards) | ⚠️ Update | Constitution mentions "Changesets for coordinated multi-package releases" - this feature updates that to Nx Release |

**Gate Decision**: PASS - No violations. Constitution's Release Process section will need updating post-implementation to reflect Nx Release as the release tool.

## Project Structure

### Documentation (this feature)

```text
specs/004-nx-release/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no APIs)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
.github/workflows/
├── ci.yml               # UPDATE: Add nx release plan:check validation
├── release.yml          # UPDATE: Modify to use Version Plans
└── release-publish.yml  # KEEP: Minor updates for version plan cleanup

.nx/
└── version-plans/       # NEW: Directory for version plan files (git-tracked)

nx.json                  # UPDATE: Enable versionPlans configuration
package.json             # UPDATE: Add version plan npm scripts
.changeset/              # REMOVE: No longer needed after migration
```

**Structure Decision**: This is a CI/CD configuration change, not application code. Changes are isolated to GitHub Actions workflows, nx.json configuration, and package.json scripts.

## Complexity Tracking

No complexity violations - this is a straightforward configuration migration with minimal new code.

## Constitution Check (Post-Design)

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| I. Markdown-First Design | ✅ Pass | Confirmed: Version plan files use markdown format |
| II. Adapter Neutrality | ✅ N/A | No runtime code changes |
| III. Type Safety | ✅ N/A | Configuration only |
| IV. Testability | ✅ Pass | `nx release plan:check` validates in CI; `--dry-run` for safe testing |
| V. Composability | ✅ N/A | Not applicable |
| Release Process | ✅ Updated | Constitution updated to "Nx Release with Version Plans" (v1.0.1) |

**Post-Design Gate**: PASS

**Required Follow-up**: ✅ Updated `.specify/memory/constitution.md` to reflect Nx Release (v1.0.0 → v1.0.1).

## Generated Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | `specs/004-nx-release/research.md` | ✅ Complete |
| Data Model | `specs/004-nx-release/data-model.md` | ✅ Complete |
| CLI Contracts | `specs/004-nx-release/contracts/cli-commands.md` | ✅ Complete |
| Quickstart | `specs/004-nx-release/quickstart.md` | ✅ Complete |
| Agent Context | `CLAUDE.md` | ✅ Updated |
