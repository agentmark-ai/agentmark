# Tasks: Replace Changeset with Nx Release

**Input**: Design documents from `/specs/004-nx-release/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: No automated tests requested - this is CI/CD configuration. Manual workflow testing specified.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create directory structure and prepare for version plans

- [x] T001 Create `.nx/version-plans/` directory for version plan files
- [x] T002 Add `.nx/version-plans/.gitkeep` to track empty directory in git

---

## Phase 2: Foundational (Configuration)

**Purpose**: Core configuration that enables all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Update `nx.json` to enable `versionPlans: true` in release configuration
- [x] T004 [P] Update `nx.json` to add `ignorePatternsForPlanCheck` for test files in versionPlans config
- [x] T005 [P] Add `release:plan` script to `package.json`: `"release:plan": "nx release plan"`
- [x] T006 [P] Add `release:plan:check` script to `package.json`: `"release:plan:check": "nx release plan:check --base=origin/main --head=HEAD"`

**Checkpoint**: Configuration ready - user story implementation can now proceed

---

## Phase 3: User Story 1 - Developer Creates Version Bump (Priority: P1) 🎯 MVP

**Goal**: Developers can run `nx release plan` to create version plan files documenting their changes

**Independent Test**: Run `yarn release:plan`, select a package and bump type, verify file created in `.nx/version-plans/`

### Implementation for User Story 1

- [x] T007 [US1] Verify `nx release plan` command works with current nx.json configuration
- [x] T008 [US1] Test creating a sample version plan file via `nx release plan minor -m "Test change"`
- [x] T009 [US1] Verify version plan file format matches expected structure (YAML front matter + markdown body)
- [x] T010 [US1] Test that multiple version plan files can coexist in `.nx/version-plans/`

**Checkpoint**: Developers can create version plan files - US1 complete

---

## Phase 4: User Story 2 - Maintainer Prepares Release PR (Priority: P1)

**Goal**: Maintainers can trigger workflow to create PR with version bumps from accumulated version plans

**Independent Test**: Trigger Prepare Release workflow, verify PR created with correct version updates

### Implementation for User Story 2

- [x] T011 [US2] Update `.github/workflows/release.yml` to remove version input parameter (bump types now come from version plans); KEEP `preid` input for prerelease support
- [x] T012 [US2] Update `.github/workflows/release.yml` to use `nx release version` without explicit bump type (reads from version plans)
- [x] T013 [US2] Update `.github/workflows/release.yml` to check for existing version plans before proceeding
- [x] T014 [US2] Add graceful exit message when no version plans exist in `.github/workflows/release.yml`
- [x] T015 [US2] Verify `nx release changelog` generates per-package and workspace changelogs correctly

**Checkpoint**: Release preparation workflow uses version plans - US2 complete

---

## Phase 5: User Story 3 - Automated Publishing on PR Merge (Priority: P1)

**Goal**: When release PR is merged, packages are published to npm automatically

**Independent Test**: Merge a release PR, verify packages published to npm with correct versions and GitHub releases created

### Implementation for User Story 3

- [x] T016 [US3] Review `.github/workflows/release-publish.yml` for compatibility with version plans workflow; verify `NPM_CONFIG_PROVENANCE=true` is set
- [x] T017 [US3] Verify git tag creation logic in `.github/workflows/release-publish.yml` handles new version pattern
- [x] T018 [US3] Verify GitHub release creation still works with updated workflow
- [x] T019 [US3] Test partial publish failure handling - workflow should continue and report failures at end

**Checkpoint**: Publish workflow compatible with version plans - US3 complete

---

## Phase 6: User Story 4 - Developer Previews Release Changes (Priority: P2)

**Goal**: Developers can preview what a release would look like before triggering it

**Independent Test**: Run dry-run command, verify output shows planned changes without modifying files

### Implementation for User Story 4

- [x] T020 [US4] Verify existing `release:dry-run` script works with version plans
- [x] T021 [US4] Update `.github/workflows/ci.yml` to add `nx release plan:check` validation step
- [x] T022 [US4] Configure CI step to run on pull requests targeting main branch
- [x] T023 [US4] Test CI validation - should fail when changed packages lack version plan files

**Checkpoint**: Dry-run and CI validation working - US4 complete

---

## Phase 7: Polish & Cleanup

**Purpose**: Remove old changeset artifacts and finalize migration

- [x] T024 Remove `.changeset/config.json` file
- [x] T025 Remove `.changeset/README.md` file (if exists)
- [x] T026 [P] Remove any remaining `.changeset/` directory contents and the directory itself
- [x] T027 [P] Check for and remove `@changesets/cli` from devDependencies if present in `package.json`
- [x] T028 [P] Update repository documentation to reference nx release instead of changeset (if applicable)
- [x] T029 Run end-to-end validation per `specs/004-nx-release/quickstart.md`
- [x] T030 Create a sample version plan to verify full workflow (can be deleted after verification)
- [x] T031 [P] Test prerelease workflow: create version plan with `prerelease` bump type, trigger workflow with `--preid=beta`, verify version like `1.0.1-beta.0`
- [x] T032 [P] Verify excluded packages (per nx.json `release.projects` negation patterns) are skipped during `nx release version --dry-run`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Phase 3): Can proceed immediately after Foundational
  - US2 (Phase 4): Can proceed in parallel with US1 (different files)
  - US3 (Phase 5): Can proceed in parallel with US1/US2 (different files)
  - US4 (Phase 6): Can proceed in parallel with others (different files)
- **Polish (Phase 7)**: Depends on all user stories being validated

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - enables developer workflow
- **User Story 2 (P1)**: No dependencies on other stories - enables release preparation
- **User Story 3 (P1)**: Logically follows US2 in workflow, but implementation independent
- **User Story 4 (P2)**: No dependencies - adds validation layer

### Within Each User Story

- Configuration changes before verification tasks
- Core functionality before edge case handling
- Local testing before CI integration

### Parallel Opportunities

**Phase 2 (Foundational)**:
```bash
# These can run in parallel (different files):
T004: nx.json ignorePatternsForPlanCheck
T005: package.json release:plan script
T006: package.json release:plan:check script
```

**User Stories (after Phase 2)**:
```bash
# All user story phases can run in parallel if desired:
Phase 3 (US1): nx.json verification, version plan testing
Phase 4 (US2): release.yml workflow updates
Phase 5 (US3): release-publish.yml verification
Phase 6 (US4): ci.yml validation step
```

**Phase 7 (Polish)**:
```bash
# These can run in parallel:
T026: Remove .changeset/ directory
T027: Remove @changesets/cli dependency
T028: Update documentation
```

---

## Implementation Strategy

### MVP First (User Stories 1-3)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T006)
3. Complete Phase 3: US1 - Developer workflow (T007-T010)
4. **VALIDATE**: Run `yarn release:plan` and create a test version plan
5. Complete Phase 4: US2 - Release PR preparation (T011-T015)
6. Complete Phase 5: US3 - Automated publishing (T016-T019)
7. **VALIDATE**: Run full release workflow with test version plans

### Add CI Validation (User Story 4)

8. Complete Phase 6: US4 - CI validation (T020-T023)
9. **VALIDATE**: Create PR without version plan, verify CI fails

### Cleanup

10. Complete Phase 7: Polish (T024-T030)
11. **FINAL VALIDATION**: Full end-to-end test per quickstart.md

### Parallel Team Strategy

With multiple developers after Foundational phase:
- Developer A: US1 + US2 (version plan creation + release workflow)
- Developer B: US3 + US4 (publish workflow + CI validation)
- Both: Phase 7 cleanup

---

## Notes

- **Total tasks**: 32 (T001-T032)
- This is primarily a configuration change, not application code
- All workflows can be tested with `--dry-run` flags before live execution
- Version plans are consumed (deleted) during release - test with disposable plans
- Existing changeset files in `.changeset/` should be handled before removal
- NPM_TOKEN secret must already be configured for publish workflow
- Prerelease workflow: version plan specifies bump type (`prerelease`), workflow provides `--preid` (alpha, beta, rc)
