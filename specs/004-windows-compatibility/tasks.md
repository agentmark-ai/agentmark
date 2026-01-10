# Tasks: Windows Compatibility

**Input**: Design documents from `/specs/004-windows-compatibility/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

**Tests**: Not explicitly requested - tests are handled via CI matrix verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install cross-platform dependencies and create helper utilities

- [x] T001 Add cross-env and shx as devDependencies in package.json (root)
- [x] T002 [P] Create scripts/cross-platform-chmod.js helper for platform-conditional chmod
- [x] T003 [P] Create scripts/run-venv.js helper for cross-platform Python venv execution

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fix root-level package.json issues that affect all packages

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Fix env var syntax in package.json (root) version script using cross-env
- [x] T005 Document Git Bash requirement for .specify/scripts/bash/ in CONTRIBUTING.md or README

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Run Development Environment on Windows (Priority: P1) 🎯 MVP

**Goal**: Windows developers can run `yarn install`, `yarn dev`, and `yarn build` successfully

**Independent Test**: Clone repo on Windows, run `yarn install && yarn build && yarn dev` - all commands succeed

### Implementation for User Story 1

- [x] T006 [P] [US1] Update packages/cli/package.json build script to use platform-conditional chmod via scripts/cross-platform-chmod.js
- [x] T007 [P] [US1] Update packages/cli/package.json prepack script to use platform-conditional chmod
- [x] T008 [P] [US1] Update packages/cli/package.json prepare script to use platform-conditional chmod
- [x] T009 [P] [US1] Update packages/create-agentmark/package.json build script to use platform-conditional chmod
- [x] T010 [P] [US1] Update packages/create-agentmark/package.json prepack script to use platform-conditional chmod
- [x] T011 [P] [US1] Update packages/create-agentmark/package.json prepare script to use platform-conditional chmod

**Checkpoint**: At this point, `yarn install` and `yarn build` should work on Windows

---

## Phase 4: User Story 2 - Run Test Suite on Windows (Priority: P1)

**Goal**: Windows developers can run `yarn test` and integration tests successfully

**Independent Test**: Run `yarn test` on Windows - all TypeScript tests pass; run `yarn test:integration` with server running - all integration tests pass

### Implementation for User Story 2

- [x] T012 [US2] Update packages/mcp-server/package.json test:integration script to use cross-env for RUN_INTEGRATION_TESTS

**Checkpoint**: At this point, `yarn test` should work on Windows for TypeScript packages

---

## Phase 5: User Story 3 - Run CI Workflow Locally on Windows (Priority: P2)

**Goal**: Windows developers can run linting and build commands matching CI

**Independent Test**: Run `yarn lint` and `yarn build` on Windows - matches CI behavior

### Implementation for User Story 3

- [x] T013 [US3] Update .github/workflows/ci.yml to add windows-latest to test matrix
- [x] T014 [US3] Update .github/workflows/ci.yml bash for-loop syntax to use shell: bash explicitly
- [x] T015 [US3] Update .github/workflows/ci.yml to handle seed-test-data.sh on Windows (use shell: bash)

**Checkpoint**: At this point, CI runs on both Ubuntu and Windows

---

## Phase 6: User Story 4 - Develop Python Packages on Windows (Priority: P2)

**Goal**: Windows developers can set up Python venvs and run pytest in Python packages

**Independent Test**: Navigate to packages/sdk-python, run `yarn postinstall` and `yarn test` on Windows - venv created and tests pass

### Implementation for User Story 4

- [x] T016 [P] [US4] Update packages/sdk-python/package.json postinstall script to use scripts/run-venv.js
- [x] T017 [P] [US4] Update packages/sdk-python/package.json test script to use scripts/run-venv.js
- [x] T018 [P] [US4] Update packages/sdk-python/package.json lint script to use scripts/run-venv.js or shx
- [x] T019 [P] [US4] Update packages/sdk-python/package.json format script to use scripts/run-venv.js
- [x] T020 [P] [US4] Update packages/sdk-python/package.json typecheck script to use scripts/run-venv.js
- [x] T021 [P] [US4] Update packages/sdk-python/package.json clean script to use shx rm -rf
- [x] T022 [P] [US4] Update packages/templatedx-python/package.json postinstall script to use scripts/run-venv.js
- [x] T023 [P] [US4] Update packages/templatedx-python/package.json test script to use scripts/run-venv.js
- [x] T024 [P] [US4] Update packages/templatedx-python/package.json lint script to use scripts/run-venv.js
- [x] T025 [P] [US4] Update packages/templatedx-python/package.json format script to use scripts/run-venv.js
- [x] T026 [P] [US4] Update packages/prompt-core-python/package.json postinstall script to use scripts/run-venv.js
- [x] T027 [P] [US4] Update packages/prompt-core-python/package.json test script to use scripts/run-venv.js
- [x] T028 [P] [US4] Update packages/prompt-core-python/package.json lint script to use scripts/run-venv.js
- [x] T029 [P] [US4] Update packages/prompt-core-python/package.json format script to use scripts/run-venv.js
- [x] T030 [P] [US4] Update packages/pydantic-ai-v0-adapter/package.json postinstall script to use scripts/run-venv.js
- [x] T031 [P] [US4] Update packages/pydantic-ai-v0-adapter/package.json test script to use scripts/run-venv.js
- [x] T032 [P] [US4] Update packages/pydantic-ai-v0-adapter/package.json lint script to use scripts/run-venv.js
- [x] T033 [P] [US4] Update packages/pydantic-ai-v0-adapter/package.json format script to use scripts/run-venv.js
- [x] T034 [P] [US4] Update packages/pydantic-ai-v0-adapter/package.json typecheck script to use scripts/run-venv.js
- [x] T035 [P] [US4] Update packages/pydantic-ai-v0-adapter/package.json clean script to use shx rm -rf

**Checkpoint**: All Python packages should work on Windows

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final validation

- [x] T036 [P] Add Windows setup instructions to quickstart.md or CONTRIBUTING.md
- [x] T037 [P] Document shell compatibility (PowerShell, cmd, Git Bash) in README
- [ ] T038 Run full validation on Windows: yarn install, yarn build, yarn test
- [ ] T039 Verify CI passes on windows-latest runner

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (dev environment) and US2 (tests) are P1 - do first
  - US3 (CI) and US4 (Python) are P2 - do second
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Validates US1+US2 work in CI
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Independent from other stories

### Within Each User Story

- Setup tasks create shared utilities (T002, T003)
- US1 tasks (T006-T011) are all parallel - different files
- US2 has single task (T012)
- US3 tasks (T013-T015) should be sequential within CI file
- US4 tasks (T016-T035) are all parallel - different package.json files

### Parallel Opportunities

- T002 and T003 can run in parallel (different helper scripts)
- All US1 tasks (T006-T011) can run in parallel (different package.json files)
- All US4 tasks (T016-T035) can run in parallel (different package.json files)
- US1 and US2 can run in parallel (different concerns)
- T036 and T037 can run in parallel (different docs)

---

## Parallel Example: User Story 1

```bash
# Launch all chmod fixes for US1 together (6 parallel tasks):
Task: T006 - packages/cli/package.json build script
Task: T007 - packages/cli/package.json prepack script
Task: T008 - packages/cli/package.json prepare script
Task: T009 - packages/create-agentmark/package.json build script
Task: T010 - packages/create-agentmark/package.json prepack script
Task: T011 - packages/create-agentmark/package.json prepare script
```

## Parallel Example: User Story 4

```bash
# Launch all Python package fixes together (20 parallel tasks):
# sdk-python (6 tasks): T016-T021
# templatedx-python (4 tasks): T022-T025
# prompt-core-python (4 tasks): T026-T029
# pydantic-ai-v0-adapter (6 tasks): T030-T035
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T005)
3. Complete Phase 3: User Story 1 (T006-T011)
4. Complete Phase 4: User Story 2 (T012)
5. **STOP and VALIDATE**: Test on Windows - yarn install, build, test
6. Deploy/demo if ready - TypeScript development works on Windows!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 + 2 → Test on Windows → **MVP Complete**
3. Add User Story 3 → CI validates cross-platform
4. Add User Story 4 → Python development works on Windows
5. Polish → Documentation complete

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (all 6 tasks parallel)
   - Developer B: User Story 2 + User Story 3
3. After US1+US2 validated:
   - Developer A: User Story 4 sdk-python + templatedx-python
   - Developer B: User Story 4 prompt-core-python + pydantic-ai-v0-adapter
4. Both: Polish phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Helper scripts (T002, T003) are shared utilities that all stories depend on
