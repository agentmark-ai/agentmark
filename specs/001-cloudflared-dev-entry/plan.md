# Implementation Plan: Dev Entry Tracking & Cloudflared Tunneling

**Branch**: `001-cloudflared-dev-entry` | **Date**: 2026-01-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-cloudflared-dev-entry/spec.md`

## Summary

This feature implements two related improvements to the AgentMark development workflow:

1. **Dev Entry Version Control**: Move `dev-entry.ts` from the gitignored `.agentmark/` directory to the project root, enabling teams to track and customize the development server configuration in version control.

2. **Cloudflared Tunneling**: Replace the `localtunnel` package with Cloudflare's `cloudflared` binary for more reliable public tunnel creation during development, including automatic binary download with user consent.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 18+)
**Primary Dependencies**:
- `@agentmark-ai/cli` (tunnel.ts, commands/dev.ts)
- `create-agentmark` (create-example-app.ts, templates/package-setup.ts)
- cloudflared binary (to be downloaded/managed)
**Storage**: N/A (file system operations for dev-entry.ts placement)
**Testing**: vitest (existing test infrastructure)
**Target Platform**: Cross-platform (Windows, macOS, Linux)
**Project Type**: Monorepo (packages/cli, packages/create-agentmark)
**Performance Goals**: Tunnel connection under 10 seconds, reconnection within 30 seconds
**Constraints**: Must work without global cloudflared installation, binary auto-download with consent
**Scale/Scope**: Single developer local tool, one tunnel per dev session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | N/A | Feature does not involve prompt definitions |
| II. Adapter Neutrality | N/A | Feature does not involve LLM providers |
| III. Type Safety | ✅ PASS | Will maintain typed TunnelInfo interface, export types for consumers |
| IV. Testability | ✅ PASS | Will add unit tests for tunnel logic, integration tests for binary management |
| V. Composability | N/A | Feature does not involve prompt components |
| VI. Cross-Platform Compatibility | ⚠️ CRITICAL | Must download correct cloudflared binary per platform (Windows/macOS/Linux/arm64) |

**Cross-Platform Requirements**:
- Cloudflared binary download must detect OS and architecture
- Path handling for binary storage must work across platforms
- Process spawning must handle Windows vs Unix differences
- File permissions (chmod) must be platform-conditional

## Project Structure

### Documentation (this feature)

```text
specs/001-cloudflared-dev-entry/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/
├── cli/
│   ├── cli-src/
│   │   ├── tunnel.ts              # MODIFY: Replace localtunnel with cloudflared
│   │   ├── cloudflared/           # NEW: Cloudflared binary management
│   │   │   ├── types.ts           # TypeScript interfaces (TunnelInfo, PlatformInfo, etc.)
│   │   │   ├── download.ts        # Binary download with consent prompt
│   │   │   ├── platform.ts        # Platform detection and binary paths
│   │   │   └── index.ts           # Public exports
│   │   └── commands/
│   │       └── dev.ts             # MODIFY: Update dev-entry.ts lookup paths
│   ├── test/
│   │   └── unit/
│   │       ├── cloudflared.test.ts  # NEW: Unit tests for cloudflared logic
│   │       └── tunnel.test.ts       # MODIFY: Update for cloudflared
│   └── package.json               # MODIFY: Remove localtunnel dependency
│
└── create-agentmark/
    ├── src/
    │   └── utils/
    │       └── examples/
    │           ├── create-example-app.ts  # MODIFY: dev-entry.ts location
    │           └── templates/
    │               └── package-setup.ts   # MODIFY: Remove axios override
    └── test/
        └── init.test.ts           # MODIFY: Update expected file locations
```

**Structure Decision**: Existing monorepo structure retained. New cloudflared module added under `cli-src/cloudflared/` for binary management isolation.

## Constitution Check (Post-Design)

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | N/A | No changes |
| II. Adapter Neutrality | N/A | No changes |
| III. Type Safety | ✅ PASS | TunnelInfo, PlatformInfo, CloudflaredConfig interfaces defined in data-model.md |
| IV. Testability | ✅ PASS | Test checklist in quickstart.md covers unit and integration tests |
| V. Composability | N/A | No changes |
| VI. Cross-Platform Compatibility | ✅ PASS | Platform detection module handles Windows/macOS/Linux with architecture variants |

**All gates pass. Ready for task generation.**

## Complexity Tracking

> No constitution violations requiring justification. Cross-platform compatibility is addressed through platform detection module.

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Research | [research.md](./research.md) | Cloudflared API, binary management, process handling research |
| Data Model | [data-model.md](./data-model.md) | TypeScript interfaces, state transitions, validation rules |
| Quickstart | [quickstart.md](./quickstart.md) | Implementation guide with code examples |
| Contracts | [contracts/](./contracts/) | N/A - no API contracts for this feature |
