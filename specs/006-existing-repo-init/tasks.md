# Tasks: Existing Repository Initialization

**Input**: Design documents from `/specs/006-existing-repo-init/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Unit tests included per Constitution Principle IV (Testability)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Package**: `packages/create-agentmark/`
- **Source**: `packages/create-agentmark/src/`
- **Tests**: `packages/create-agentmark/test/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new utility modules and test structure

- [x] T001 Create utility directory structure at packages/create-agentmark/src/utils/ (if not exists)
- [x] T002 Create test directory structure at packages/create-agentmark/test/unit/ and packages/create-agentmark/test/integration/
- [x] T003 [P] Add TypeScript interfaces from data-model.md in packages/create-agentmark/src/utils/types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core detection and merge utilities that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Implement project detection logic in packages/create-agentmark/src/utils/project-detection.ts (detectProjectInfo function)
- [x] T005 [P] Implement package manager detection in packages/create-agentmark/src/utils/package-manager.ts (detectPackageManager, getPackageManagerConfig functions)
- [x] T006 [P] Implement file merge utilities in packages/create-agentmark/src/utils/file-merge.ts (mergePackageJson, appendGitignore, appendEnv functions)
- [x] T007 [P] Implement conflict resolution prompts in packages/create-agentmark/src/utils/conflict-resolution.ts (detectConflicts, promptForResolutions functions)
- [x] T008 [P] Unit test for project detection in packages/create-agentmark/test/unit/project-detection.test.ts
- [x] T009 [P] Unit test for package manager detection in packages/create-agentmark/test/unit/package-manager.test.ts
- [x] T010 [P] Unit test for file merge utilities in packages/create-agentmark/test/unit/file-merge.test.ts

**Checkpoint**: Foundation ready - all utility modules implemented and tested

---

## Phase 3: User Story 1 - Initialize AgentMark in Existing TypeScript Project (Priority: P1) 🎯 MVP

**Goal**: Allow developers to add AgentMark to existing TypeScript/Node.js projects without breaking their setup

**Independent Test**: Run `npx create-agentmark` in any existing TypeScript project, verify project still builds and has functional AgentMark integration

### Implementation for User Story 1

- [x] T011 [US1] Modify main entry point to detect existing projects in packages/create-agentmark/src/index.ts (add project detection after folder selection)
- [x] T012 [US1] Update createExampleApp to accept ProjectInfo parameter in packages/create-agentmark/src/utils/examples/create-example-app.ts
- [x] T013 [US1] Implement package.json merge logic in createExampleApp (use mergePackageJson instead of overwriting)
- [x] T014 [US1] Implement script conflict resolution (use agentmark:dev if dev exists) in packages/create-agentmark/src/utils/examples/templates/package-setup.ts
- [x] T015 [US1] Implement .gitignore append logic in createExampleApp (use appendGitignore instead of overwriting)
- [x] T016 [US1] Implement .env append logic in createExampleApp (use appendEnv instead of overwriting)
- [x] T017 [US1] Skip index.ts generation when existing project detected in packages/create-agentmark/src/utils/examples/create-example-app.ts
- [x] T018 [US1] Use detected package manager for dependency installation in packages/create-agentmark/src/utils/examples/templates/package-setup.ts (replace hardcoded npm commands)
- [x] T019 [US1] Integration test for TypeScript existing project in packages/create-agentmark/test/integration/existing-repo.test.ts

**Checkpoint**: User Story 1 complete - TypeScript existing project initialization works

---

## Phase 4: User Story 2 - Initialize AgentMark in Existing Python Project (Priority: P1)

**Goal**: Allow developers to add AgentMark to existing Python projects without breaking their setup

**Independent Test**: Run `npx create-agentmark --python` in any existing Python project, verify project still works and has functional AgentMark integration

### Implementation for User Story 2

- [x] T020 [US2] Implement Python venv detection in packages/create-agentmark/src/utils/project-detection.ts (detectPythonVenv function)
- [x] T021 [US2] Unit test for Python venv detection in packages/create-agentmark/test/unit/project-detection.test.ts
- [x] T022 [US2] Update createPythonApp to accept ProjectInfo parameter in packages/create-agentmark/src/utils/examples/create-python-app.ts
- [x] T023 [US2] Skip pyproject.toml generation when existing project detected in packages/create-agentmark/src/utils/examples/create-python-app.ts
- [x] T024 [US2] Skip main.py generation when existing project detected in packages/create-agentmark/src/utils/examples/create-python-app.ts
- [x] T025 [US2] Implement .gitignore append logic in createPythonApp (use appendGitignore)
- [x] T026 [US2] Implement .env append logic in createPythonApp (use appendEnv)
- [x] T027 [US2] Show venv activation reminder if existing venv detected in packages/create-agentmark/src/utils/examples/create-python-app.ts
- [x] T028 [US2] Integration test for Python existing project in packages/create-agentmark/test/integration/existing-repo.test.ts

**Checkpoint**: User Stories 1 AND 2 complete - both TypeScript and Python existing project initialization works

---

## Phase 5: User Story 3 - Initialize in Current Directory (Priority: P2)

**Goal**: Allow developers to initialize AgentMark in their current working directory using "." as folder name

**Independent Test**: Run `npx create-agentmark`, enter "." as folder name, verify files created in current directory without nested folder

### Implementation for User Story 3

- [x] T029 [US3] Handle "." and "./" folder names in main entry point in packages/create-agentmark/src/index.ts (skip mkdir, use cwd)
- [x] T030 [US3] Update "Next Steps" output to skip `cd` instruction when folder is "." in packages/create-agentmark/src/utils/examples/create-example-app.ts
- [x] T031 [US3] Update "Next Steps" output for Python to skip `cd` instruction when folder is "." in packages/create-agentmark/src/utils/examples/create-python-app.ts
- [x] T032 [US3] Integration test for current directory initialization in packages/create-agentmark/test/integration/existing-repo.test.ts

**Checkpoint**: User Story 3 complete - current directory initialization works

---

## Phase 6: User Story 4 - Graceful Conflict Detection (Priority: P2)

**Goal**: Detect potential file conflicts and prompt users for resolution before overwriting

**Independent Test**: Create project with existing agentmark.json, run create-agentmark, verify user is prompted before overwrite

### Implementation for User Story 4

- [x] T033 [US4] Integrate conflict detection in main entry point after project detection in packages/create-agentmark/src/index.ts
- [x] T034 [US4] Pass conflict resolutions to createExampleApp in packages/create-agentmark/src/index.ts
- [x] T035 [US4] Pass conflict resolutions to createPythonApp in packages/create-agentmark/src/index.ts
- [x] T036 [US4] Implement resolution handling in createExampleApp (skip/overwrite based on user choice) in packages/create-agentmark/src/utils/examples/create-example-app.ts
- [x] T037 [US4] Implement resolution handling in createPythonApp (skip/overwrite based on user choice) in packages/create-agentmark/src/utils/examples/create-python-app.ts
- [x] T038 [US4] Integration test for conflict detection and resolution in packages/create-agentmark/test/integration/existing-repo.test.ts

**Checkpoint**: User Story 4 complete - conflict detection and prompting works

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements and validation

- [ ] T039 [P] Add comprehensive JSDoc comments to all new utility functions
- [x] T040 [P] Update packages/create-agentmark/package.json test scripts (add unit and integration test commands)
- [x] T041 Run all tests and verify they pass on macOS (91 tests passing)
- [ ] T042 Verify cross-platform compatibility (Windows path handling)
- [ ] T043 Manual end-to-end testing with real existing projects (Next.js, Express, FastAPI)
- [ ] T044 Update quickstart.md if any behavior differs from documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (different files)
  - US3 depends on US1 (modifies same entry point)
  - US4 depends on US1 and US2 (integrates with both)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - TypeScript support
- **User Story 2 (P1)**: Can start after Foundational - Python support (parallel with US1)
- **User Story 3 (P2)**: Can start after US1 - depends on entry point changes
- **User Story 4 (P2)**: Can start after US1 and US2 - integrates conflict detection into both

### Within Each User Story

- Implementation tasks should follow file creation order
- Entry point changes before helper changes
- Core logic before "Next Steps" output updates

### Parallel Opportunities

**Phase 2 (all can run in parallel):**
- T004, T005, T006, T007 - different utility files
- T008, T009, T010 - different test files

**Phase 3 & 4 (stories can run in parallel):**
- US1 and US2 modify different files (create-example-app.ts vs create-python-app.ts)

---

## Parallel Example: Foundational Phase

```bash
# Launch all foundational implementations together:
Task: "Implement project detection logic in packages/create-agentmark/src/utils/project-detection.ts"
Task: "Implement package manager detection in packages/create-agentmark/src/utils/package-manager.ts"
Task: "Implement file merge utilities in packages/create-agentmark/src/utils/file-merge.ts"
Task: "Implement conflict resolution prompts in packages/create-agentmark/src/utils/conflict-resolution.ts"

# Launch all foundational tests together (after implementations):
Task: "Unit test for project detection in packages/create-agentmark/test/unit/project-detection.test.ts"
Task: "Unit test for package manager detection in packages/create-agentmark/test/unit/package-manager.test.ts"
Task: "Unit test for file merge utilities in packages/create-agentmark/test/unit/file-merge.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (TypeScript existing projects)
4. **STOP and VALIDATE**: Test with real Next.js/Express project
5. Ship MVP - TypeScript users can use existing repo initialization

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. User Story 1 → Test with TypeScript projects → Deploy (MVP!)
3. User Story 2 → Test with Python projects → Deploy
4. User Story 3 → Test current directory init → Deploy
5. User Story 4 → Test conflict detection → Deploy

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (TypeScript)
   - Developer B: User Story 2 (Python)
3. After US1 complete:
   - Developer A: User Story 3 (current dir) + User Story 4 (conflicts)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1 and US2 are both P1 priority but can be implemented in parallel
- Constitution Principle VI (Cross-Platform) must be verified in T042
