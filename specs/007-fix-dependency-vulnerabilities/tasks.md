# Tasks: Fix Dependency Security Vulnerabilities

**Input**: Design documents from `/specs/007-fix-dependency-vulnerabilities/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No test tasks included (security updates verified via `yarn npm audit`)

**Organization**: Tasks are grouped by user story to enable independent implementation and verification of each security fix category.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `package.json` at root, `packages/*/package.json` for workspaces
- Paths shown use absolute paths from repository root

---

## Phase 1: Setup (Baseline & Preparation)

**Purpose**: Capture current state and prepare for updates

- [ ] T001 Run `yarn npm audit --all --recursive > audit-before.txt` to capture baseline vulnerability count
- [ ] T002 Create git branch checkpoint with `git add -A && git stash` to preserve any uncommitted work
- [ ] T003 [P] Document current Next.js version by checking packages/cli/package.json
- [ ] T004 [P] Document current @modelcontextprotocol/sdk version by checking packages/mcp-server/package.json
- [ ] T005 [P] Document current Storybook versions by checking packages/ui-components/package.json

---

## Phase 2: Foundational (Yarn Resolutions Setup)

**Purpose**: Add yarn resolutions to root package.json for transitive dependencies - MUST complete before user story work

**⚠️ CRITICAL**: Resolutions affect all workspaces and must be in place before direct dependency updates

- [ ] T006 Add resolutions block to package.json at repository root with the following entries:
  ```json
  "resolutions": {
    "@modelcontextprotocol/sdk": "^1.25.2",
    "axios": "^1.7.9",
    "hono": "^4.11.4",
    "qs": "^6.14.1",
    "mdast-util-to-hast": "^13.2.1",
    "jsondiffpatch": "^0.7.2",
    "micromatch": "^4.0.8",
    "js-yaml": "^3.14.2",
    "prismjs": "^1.30.0",
    "body-parser": "^2.2.1",
    "braces": "^3.0.3",
    "glob": "^10.4.5"
  }
  ```

**Checkpoint**: Resolutions in place - direct dependency updates can now begin

---

## Phase 3: User Story 1 - Eliminate Critical RCE Risks (Priority: P1) 🎯 MVP

**Goal**: Fix critical Next.js RCE vulnerability (CVE-2025-55182, CVE-2025-67779)

**Independent Test**: Run `yarn npm audit --all --recursive 2>&1 | grep -i "critical"` - should return 0 results

### Implementation for User Story 1

- [ ] T007 [US1] Update `next` from "15.5.6" to "15.5.9" in packages/cli/package.json
- [ ] T008 [US1] Update `eslint-config-next` from "15.5.6" to "15.5.9" in packages/cli/package.json
- [ ] T009 [US1] Run `yarn install` to update yarn.lock with new Next.js version
- [ ] T010 [US1] Run `yarn build` in packages/cli to verify Next.js update doesn't break build
- [ ] T011 [US1] Run `yarn test` in packages/cli to verify all tests pass
- [ ] T012 [US1] Verify critical vulnerability resolved: `yarn npm audit --all --recursive 2>&1 | grep -c "critical"` should be 0

**Checkpoint**: Critical RCE vulnerability eliminated - system safe from React flight protocol attacks

---

## Phase 4: User Story 2 - Resolve High Severity Auth Vulnerabilities (Priority: P1)

**Goal**: Fix Hono JWT algorithm confusion vulnerabilities (GHSA-3vhc-576x-3qv4, GHSA-f67f-6cw9-8mq4) via yarn resolution

**Independent Test**: Run `yarn npm audit --all --recursive 2>&1 | grep -i "hono"` - should return 0 high severity issues

### Implementation for User Story 2

- [ ] T013 [US2] Verify hono resolution (^4.11.4) is included in T006 resolutions block in package.json
- [ ] T014 [US2] Run `yarn install` if not already run after T006 to apply hono resolution
- [ ] T015 [US2] Verify hono resolution applied: `yarn why hono` should show ^4.11.4 (was 4.10.5 via @mastra/core)
- [ ] T016 [US2] Verify no Hono-related vulnerabilities: `yarn npm audit --all --recursive 2>&1 | grep -i "hono" | grep -c "high"` should be 0

**Checkpoint**: Authentication vulnerabilities resolved - JWT algorithm confusion attacks prevented

---

## Phase 5: User Story 3 - Fix High Severity DoS Vulnerabilities (Priority: P2)

**Goal**: Fix MCP SDK ReDoS, axios DoS, qs DoS vulnerabilities

**Independent Test**: Run `yarn npm audit --all --recursive 2>&1 | grep -E "ReDoS|DoS|memory exhaustion"` - should return 0 high severity

### Implementation for User Story 3

- [ ] T017 [P] [US3] Update `@modelcontextprotocol/sdk` from "^1.11.0" to "^1.25.2" in packages/mcp-server/package.json
- [ ] T018 [US3] Run `yarn install` to apply MCP SDK update and resolution overrides (axios, qs)
- [ ] T019 [US3] Run `yarn build` in packages/mcp-server to verify MCP SDK update compatibility
- [ ] T020 [US3] Run `yarn test` in packages/mcp-server to verify all tests pass
- [ ] T021 [US3] Verify axios resolution applied: `yarn why axios` should show ^1.7.9
- [ ] T022 [US3] Verify qs resolution applied: `yarn why qs` should show ^6.14.1
- [ ] T023 [US3] Verify DoS vulnerabilities resolved: `yarn npm audit --all --recursive 2>&1 | grep -E "axios|qs|@modelcontextprotocol" | grep -c "high"` should be 0

**Checkpoint**: DoS vulnerabilities eliminated - system resilient against memory exhaustion and ReDoS attacks

---

## Phase 6: User Story 4 - Address SSRF and Credential Leakage (Priority: P2)

**Goal**: Fix axios SSRF and MCP SDK DNS rebinding vulnerabilities

**Independent Test**: Run `yarn npm audit --all --recursive 2>&1 | grep -i "SSRF\|credential\|rebinding"` - should return 0 high severity

### Implementation for User Story 4

- [ ] T024 [US4] Verify axios resolution (^1.7.9) addresses SSRF: check GHSA advisory for fix confirmation
- [ ] T025 [US4] Verify MCP SDK update (^1.25.2) enables DNS rebinding protection by default
- [ ] T026 [US4] Search for StreamableHTTPServerTransport usage: `grep -r "StreamableHTTPServerTransport" packages/mcp-server/` - if found, verify `enableDnsRebindingProtection: true` is set
- [ ] T027 [US4] Search for SSEServerTransport usage: `grep -r "SSEServerTransport" packages/mcp-server/` - if found, verify DNS rebinding protection is configured (enabled by default in ^1.24.0+)
- [ ] T028 [US4] Verify SSRF/credential vulnerabilities resolved: `yarn npm audit --all --recursive 2>&1 | grep -E "SSRF|credential|rebinding" | grep -c "high"` should be 0

**Checkpoint**: SSRF and credential leakage risks mitigated

---

## Phase 7: User Story 5 - Resolve Moderate Security Issues (Priority: P3)

**Goal**: Fix remaining moderate severity vulnerabilities including XSS, prototype pollution, DOM clobbering

**Independent Test**: Run `yarn npm audit --all --recursive 2>&1 | grep -c "moderate"` - should be significantly reduced

### Implementation for User Story 5

- [ ] T029 [P] [US5] Update Storybook packages to "^9.1.17" in packages/ui-components/package.json:
  - @storybook/addon-a11y
  - @storybook/addon-docs
  - @storybook/addon-vitest
  - @storybook/react-vite
  - storybook
- [ ] T030 [P] [US5] Update eslint-config-next to "15.5.9" in packages/ui-components/package.json (if present)
- [ ] T031 [US5] Run `yarn install` to apply all moderate severity resolution overrides
- [ ] T032 [US5] Run `yarn build` in packages/ui-components to verify Storybook update compatibility
- [ ] T033 [US5] Check if any Storybook env vars need STORYBOOK_ prefix after update
- [ ] T034 [US5] Run `yarn storybook build` in packages/ui-components to verify build works
- [ ] T035 [US5] Verify jsondiffpatch resolution: `yarn why jsondiffpatch` should show ^0.7.2
- [ ] T036 [US5] Verify mdast-util-to-hast resolution: `yarn why mdast-util-to-hast` should show ^13.2.1
- [ ] T037 [US5] Verify prismjs resolution: `yarn why prismjs` should show ^1.30.0
- [ ] T038 [US5] Verify js-yaml resolution: `yarn why js-yaml` should show ^4.1.0
- [ ] T039 [US5] Verify micromatch resolution: `yarn why micromatch` should show ^4.0.8
- [ ] T040 [US5] Verify body-parser resolution: `yarn why body-parser` should show ^2.2.1
- [ ] T041 [US5] Verify braces resolution: `yarn why braces` should show ^3.0.3
- [ ] T042 [US5] Verify glob resolution: `yarn why glob` should show ^10.4.5
- [ ] T043 [US5] Document remaining moderate vulnerabilities as accepted risks if any cannot be resolved

**Checkpoint**: Moderate vulnerabilities addressed - security posture significantly improved

---

## Phase 8: Polish & Final Verification

**Purpose**: Full build/test verification and final audit

- [ ] T044 Run full monorepo build: `yarn build`
- [ ] T045 Run full monorepo test suite: `yarn test`
- [ ] T046 Run full monorepo lint: `yarn lint`
- [ ] T047 Run final security audit: `yarn npm audit --all --recursive > audit-after.txt`
- [ ] T048 Compare audit results: diff audit-before.txt audit-after.txt
- [ ] T049 Verify SC-001: Zero critical vulnerabilities in audit-after.txt
- [ ] T050 Verify SC-002: Zero high severity production vulnerabilities in audit-after.txt
- [ ] T051 Document any accepted risks in specs/007-fix-dependency-vulnerabilities/research.md
- [ ] T052 Update specs/007-fix-dependency-vulnerabilities/checklists/requirements.md with final status
- [ ] T053 Run quickstart.md verification checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - Adds yarn resolutions (BLOCKS all user stories)
- **User Story 1 (Phase 3)**: Depends on Foundational - Critical RCE fix
- **User Story 2 (Phase 4)**: Depends on Foundational - Can run parallel with US1
- **User Story 3 (Phase 5)**: Depends on Foundational - Can run parallel with US1, US2
- **User Story 4 (Phase 6)**: Depends on US3 (shares MCP SDK update)
- **User Story 5 (Phase 7)**: Depends on Foundational - Can run parallel with US1-US4
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - Next.js update
- **User Story 2 (P1)**: Independent - Hono verification
- **User Story 3 (P2)**: Independent - MCP SDK, axios, qs updates
- **User Story 4 (P2)**: Depends on US3 (MCP SDK must be updated first)
- **User Story 5 (P3)**: Independent - Storybook and moderate fixes

### Parallel Opportunities

- T003, T004, T005 can run in parallel (documenting current versions)
- T017 can run in parallel with US1/US2 tasks (different packages)
- T029, T030 can run in parallel (different storybook packages)
- US1, US2, US3, US5 can largely run in parallel after Foundational phase

---

## Parallel Example: Maximum Parallelism After Foundational

```bash
# After T006 (resolutions) is complete, launch these in parallel:

# Team member 1 - Critical (US1):
Task: T007 "Update next in packages/cli/package.json"

# Team member 2 - DoS fixes (US3):
Task: T017 "Update @modelcontextprotocol/sdk in packages/mcp-server/package.json"

# Team member 3 - Moderate fixes (US5):
Task: T029 "Update Storybook packages in packages/ui-components/package.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline)
2. Complete Phase 2: Foundational (resolutions)
3. Complete Phase 3: User Story 1 (Critical RCE)
4. **STOP and VALIDATE**: Run `yarn npm audit` - should show 0 critical
5. Commit and deploy if critical fix is urgent

### Incremental Delivery

1. Setup + Foundational → Resolutions in place
2. US1 (Critical) → 0 critical vulnerabilities → Safe to deploy
3. US3 (DoS) + US4 (SSRF) → 0 high production vulnerabilities → More secure
4. US2 (Auth) + US5 (Moderate) → Comprehensive security posture → Fully patched

### Single Developer Sequential Strategy

1. T001-T006: Setup and resolutions
2. T007-T012: US1 Critical fix (Next.js RCE)
3. T013-T016: US2 Auth fix (Hono JWT)
4. T017-T023: US3 DoS fixes (MCP SDK, axios, qs)
5. T024-T028: US4 SSRF fixes (axios, DNS rebinding)
6. T029-T043: US5 Moderate fixes (Storybook, resolutions)
7. T044-T053: Final verification

---

## Notes

- [P] tasks = different files/packages, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story can be verified independently with audit commands
- Commit after each phase completion
- yarn.lock will be regenerated after `yarn install`
- **Multiple `yarn install` tasks are intentional**: T009, T014, T018, T031 run yarn install at different phases to ensure incremental verification and allow early detection of breaking changes
- Some resolutions may pull in major version changes - watch for breaking APIs
- Accepted risks (ai@4.x filetype bypass) documented in research.md
