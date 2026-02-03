# Tasks: Dev Entry Tracking & Cloudflared Tunneling

**Input**: Design documents from `/specs/001-cloudflared-dev-entry/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are included as this is infrastructure code requiring verification.

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1 = Dev Entry, US2 = Cloudflared)
- Exact file paths included in descriptions

## Path Conventions

This is a monorepo with:
- `packages/cli/` - CLI package
- `packages/create-agentmark/` - Project scaffolding package

---

## Phase 1: Setup

**Purpose**: Prepare cloudflared module structure

- [x] T001 Create cloudflared module directory at packages/cli/cli-src/cloudflared/
- [x] T002 [P] Create TypeScript interfaces file at packages/cli/cli-src/cloudflared/types.ts with TunnelInfo, PlatformInfo, CloudflaredConfig, DownloadProgress interfaces from data-model.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure needed by both user stories

**⚠️ CRITICAL**: User story work can begin after this phase

- [x] T003 [P] Create platform detection module at packages/cli/cli-src/cloudflared/platform.ts with getPlatformInfo(), getCacheDir(), getBinaryPath() functions
- [x] T004 [P] Create binary download module at packages/cli/cli-src/cloudflared/download.ts with ensureCloudflared(), downloadBinary(), downloadFile() functions including user consent prompt
- [x] T005 Create tunnel management module at packages/cli/cli-src/cloudflared/tunnel.ts with createTunnel() function using spawn(), stdout URL parsing, and retry logic for connection failures (FR-007)
- [x] T006 Create public exports at packages/cli/cli-src/cloudflared/index.ts exporting all modules

**Checkpoint**: Cloudflared module ready - user story implementation can begin

---

## Phase 3: User Story 1 - Version Control Dev Entry Configuration (Priority: P1) 🎯 MVP

**Goal**: Move dev-entry.ts from gitignored .agentmark/ to project root so teams can track and customize it

**Independent Test**: Run `npx create-agentmark` and verify dev-entry.ts is created at project root and not in .gitignore

### Implementation for User Story 1

- [x] T007 [US1] Update dev-entry.ts output location in packages/create-agentmark/src/utils/examples/create-example-app.ts to write to project root instead of .agentmark/
- [x] T008 [US1] Update gitignore entries in packages/create-agentmark/src/utils/examples/create-example-app.ts to remove .agentmark/ from default ignores (dev-entry.ts is now at root)
- [x] T009 [US1] Update dev-entry.ts lookup logic in packages/cli/cli-src/commands/dev.ts to check project root first, then fall back to .agentmark/ for backward compatibility
- [x] T010 [US1] Add file existence check in packages/create-agentmark/src/utils/examples/create-example-app.ts to preserve existing dev-entry.ts (FR-003)
- [x] T011 [US1] Update dev.test.ts at packages/cli/test/dev.test.ts to test new dev-entry.ts location and backward compatibility

**Checkpoint**: User Story 1 complete - dev-entry.ts now tracked in version control

---

## Phase 4: User Story 2 - Reliable Public Tunnel with Cloudflared (Priority: P2)

**Goal**: Replace localtunnel with cloudflared for more reliable tunnel connections

**Independent Test**: Run `agentmark dev --tunnel` and verify a trycloudflare.com URL is displayed and routes traffic correctly

### Implementation for User Story 2

- [x] T012 [US2] Replace localtunnel import with cloudflared import in packages/cli/cli-src/tunnel.ts
- [x] T013 [US2] Update createTunnel() export in packages/cli/cli-src/tunnel.ts to use cloudflared/tunnel.ts implementation
- [x] T014 [US2] Update TunnelInfo type usage in packages/cli/cli-src/commands/dev.ts to use new cloudflared provider type
- [x] T015 [US2] Remove localtunnel dependency from packages/cli/package.json
- [x] T016 [US2] Remove @types/localtunnel devDependency from packages/cli/package.json
- [x] T017 [US2] Remove axios override from packages/create-agentmark/src/utils/examples/templates/package-setup.ts (no longer needed without localtunnel)
- [x] T018 [US2] Update tunnel disconnect handling in packages/cli/cli-src/commands/dev.ts cleanup function to use cloudflared disconnect
- [x] T019 [US2] Add error handling for cloudflared unavailability in packages/cli/cli-src/commands/dev.ts with fallback to local-only mode
- [x] T020 [P] [US2] Create unit tests for cloudflared platform detection at packages/cli/test/unit/cloudflared.test.ts
- [x] T021 [P] [US2] Create unit tests for cloudflared tunnel at packages/cli/test/unit/tunnel.test.ts for cloudflared URL pattern and behavior

**Checkpoint**: User Story 2 complete - cloudflared tunneling fully functional

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, validation, and final integration

- [x] T022 [P] Run yarn install to update lockfile after dependency changes
- [x] T023 [P] Run yarn build to verify TypeScript compilation succeeds
- [x] T024 Run yarn test to verify all tests pass (171 tests passing)
- [ ] T025 [P] Test cross-platform binary download on Windows (if available)
- [ ] T026 [P] Test cross-platform binary download on macOS (if available)
- [ ] T027 [P] Test cross-platform binary download on Linux (if available)
- [ ] T028 Manual integration test: Run `npx create-agentmark` in temp directory and verify dev-entry.ts at root
- [ ] T029 Manual integration test: Run `agentmark dev --tunnel` and verify trycloudflare.com URL works

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - creates cloudflared module
- **User Story 1 (Phase 3)**: Depends on Foundational - can start after T006
- **User Story 2 (Phase 4)**: Depends on Foundational - can start after T006
- **Polish (Phase 5)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - only needs Foundational phase
- **User Story 2 (P2)**: Independent - only needs Foundational phase
- **US1 and US2**: Can run in parallel after Foundational phase completes
- **⚠️ Note**: T011 (US1) and T021 (US2) both modify tunnel.test.ts - if running stories in parallel, coordinate test file changes

### Within Each Phase

**Foundational:**
- T003 and T004 can run in parallel [P]
- T005 depends on T003, T004 (uses platform and download modules)
- T006 depends on T003, T004, T005 (exports all)

**User Story 1:**
- T007, T008 MUST run sequentially (same file: create-example-app.ts)
- T009 depends on T007 (dev.ts needs to know new location)
- T010 depends on T007 (preservation logic)
- T011 depends on T007-T010 (tests verify behavior)

**User Story 2:**
- T012, T013 sequential (same file tunnel.ts)
- T015, T016, T017 can run in parallel [P] (different package.json files)
- T018, T019 depend on T012-T014 (dev.ts integration)
- T020, T021 can run in parallel [P] (different test files)

### Parallel Opportunities

```text
# Foundational phase parallel tasks:
T003 [P] platform.ts
T004 [P] download.ts

# User Story 2 dependency removal (parallel):
T015 [P] Remove localtunnel from cli/package.json
T016 [P] Remove @types/localtunnel from cli/package.json
T017 [P] Remove axios override from create-agentmark

# User Story 2 tests (parallel):
T020 [P] test/unit/cloudflared.test.ts
T021 [P] test/unit/tunnel.test.ts updates

# Polish phase parallel tasks:
T022 [P] yarn install
T023 [P] yarn build
T025-T027 [P] Cross-platform testing
```

---

## Parallel Example: Foundational Phase

```bash
# Launch platform and download modules in parallel:
Task: "Create platform detection module at packages/cli/cli-src/cloudflared/platform.ts"
Task: "Create binary download module at packages/cli/cli-src/cloudflared/download.ts"

# Then sequentially:
Task: "Create tunnel management module at packages/cli/cli-src/cloudflared/tunnel.ts"
Task: "Create public exports at packages/cli/cli-src/cloudflared/index.ts"
```

## Parallel Example: User Story 2 Cleanup

```bash
# Launch all dependency removals in parallel:
Task: "Remove localtunnel dependency from packages/cli/package.json"
Task: "Remove @types/localtunnel devDependency from packages/cli/package.json"
Task: "Remove axios override from packages/create-agentmark/src/utils/examples/templates/package-setup.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T006)
3. Complete Phase 3: User Story 1 (T007-T011)
4. **STOP and VALIDATE**: Test with `npx create-agentmark`
5. Deploy if ready - dev-entry.ts is now version controlled

### Full Feature Delivery

1. Complete Setup + Foundational
2. Complete User Story 1 → Test independently
3. Complete User Story 2 → Test independently
4. Complete Polish → Full integration testing
5. Both stories add value independently

### Parallel Team Strategy

With two developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (dev-entry relocation)
   - Developer B: User Story 2 (cloudflared integration)
3. Stories complete and merge independently

---

## Task Summary

| Phase | Task Count | Parallel Tasks |
|-------|------------|----------------|
| Setup | 2 | 1 |
| Foundational | 4 | 2 |
| User Story 1 | 5 | 0 |
| User Story 2 | 10 | 5 |
| Polish | 8 | 6 |
| **Total** | **29** | **14** |

---

## Notes

- [P] tasks = different files, no dependencies
- [US1] = Dev Entry Version Control tasks
- [US2] = Cloudflared Tunneling tasks
- Each user story independently testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story
- MVP scope: Phase 1-3 (Setup + Foundational + US1)
