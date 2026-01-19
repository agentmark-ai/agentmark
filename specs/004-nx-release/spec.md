# Feature Specification: Replace Changeset with Nx Release

**Feature Branch**: `004-nx-release`
**Created**: 2026-01-08
**Status**: Draft
**Input**: User description: "Replace changeset with nx release, issue with changeset is that when a peer dependency of a package gets a minor bump the package automatically gets a major bump. The nx release workflow should be similar to changeset."

## Clarifications

### Session 2026-01-08

- Q: What version bump strategy should be used (Version Plans, Conventional Commits, or workflow-driven)? → A: Version Plans - developers run `nx release plan` to create files in `.nx/version-plans/` per change
- Q: What happens if npm publish fails for one package in a multi-package release? → A: Continue publishing all packages, report failures at end for manual retry (matches changeset behavior)
- Q: Should version plan validation be enforced in CI? → A: Required - CI fails if changed packages lack version plan files

## Problem Statement

The current release workflow using Changeset has a problematic behavior: when a peer dependency of a package receives a minor version bump, Changeset automatically triggers a major version bump on the dependent package. This is overly aggressive and does not align with semantic versioning principles, where a minor bump in a peer dependency should typically result in a patch or minor bump (not major) in the dependent package.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Creates Version Bump (Priority: P1)

A developer completes work on a package and needs to create a version plan file describing the changes, similar to how they would create a changeset file today. They run `nx release plan` which guides them through selecting affected packages and bump types, creating a markdown file in `.nx/version-plans/`.

**Why this priority**: This is the core daily workflow that developers use to document their changes. Without this, no releases can be prepared.

**Independent Test**: Can be fully tested by a developer running `nx release plan`, selecting a package and bump type, and verifying a version plan file is created in `.nx/version-plans/`.

**Acceptance Scenarios**:

1. **Given** a developer has made changes to a package, **When** they run `nx release plan`, **Then** they can select the affected package(s) and specify the bump type (major/minor/patch) via interactive prompts
2. **Given** a developer creates a version plan file, **When** they specify a minor bump, **Then** the file is recorded without automatically escalating to major bump due to peer dependencies
3. **Given** multiple developers create version plan files on separate branches, **When** branches are merged, **Then** all version plan files in `.nx/version-plans/` are preserved and processed together during release

---

### User Story 2 - Maintainer Prepares Release PR (Priority: P1)

A maintainer triggers the release preparation workflow to create a PR that contains all pending version bumps, updated changelogs, and version updates.

**Why this priority**: This enables the batch release workflow that the team relies on, similar to changeset's "Version Packages" PR.

**Independent Test**: Can be fully tested by triggering the workflow manually and verifying a PR is created with correct version updates and changelog entries.

**Acceptance Scenarios**:

1. **Given** there are pending version bump entries, **When** the release workflow is triggered, **Then** a PR is created with all package versions updated according to the entries
2. **Given** multiple packages have version bumps, **When** the release PR is created, **Then** each package's CHANGELOG.md is updated with the changes
3. **Given** a package has peer dependencies that were bumped, **When** the release PR is prepared, **Then** the dependent package version follows the explicit bump type specified (not automatically escalated to major)

---

### User Story 3 - Automated Publishing on PR Merge (Priority: P1)

When a release PR is merged to main, packages are automatically published to npm with proper tags and GitHub releases are created.

**Why this priority**: This completes the release cycle and ensures packages reach users without manual intervention.

**Independent Test**: Can be tested by merging a release PR and verifying packages are published to npm with correct versions and GitHub releases are created.

**Acceptance Scenarios**:

1. **Given** a release PR is merged to main, **When** the publish workflow triggers, **Then** all updated packages are published to npm
2. **Given** packages are published, **When** the workflow completes, **Then** git tags are created for each published package version
3. **Given** packages are published, **When** the workflow completes, **Then** GitHub releases are created with changelog content

---

### User Story 4 - Developer Previews Release Changes (Priority: P2)

A developer wants to preview what a release would look like before actually triggering it, to verify version bumps and changelog entries are correct.

**Why this priority**: Helps catch issues before they affect the release process, but releases can function without this.

**Independent Test**: Can be tested by running the dry-run command and verifying output shows expected version changes without making actual modifications.

**Acceptance Scenarios**:

1. **Given** there are pending version bump entries, **When** a developer runs the dry-run command, **Then** they see the planned version changes without any files being modified
2. **Given** a dry-run is executed, **When** results are displayed, **Then** the developer can see which packages will be bumped and to what versions

---

### Edge Cases

- **No version plans exist**: When release is triggered with no version plan files in `.nx/version-plans/`, the workflow should exit gracefully with a message indicating no changes to release
- **Conflicting version plans**: If multiple version plan files specify different bump types for the same package, the highest bump type wins (major > minor > patch)
- **Partial publish failure**: Continue publishing all packages, report failures at end with error exit code. Successfully published packages remain published; failed packages can be retried manually
- **Pre-release versions**: Version plan files specify prerelease bump type (`prerelease`, `premajor`, `preminor`, `prepatch`); maintainer provides `--preid` (alpha, beta, rc) when triggering workflow; preid applies globally to all prerelease bumps
- **Package exclusion**: Packages in the exclusion list (nx.json `release.projects` negation patterns) are skipped during version and publish phases

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow developers to create version plan files via `nx release plan` command, specifying package name, bump type (major, minor, patch), and change description
- **FR-002**: System MUST NOT automatically escalate version bumps due to peer dependency changes (solving the core changeset issue)
- **FR-003**: System MUST support independent versioning for each package in the monorepo
- **FR-004**: System MUST generate changelogs for each package based on version bump entries
- **FR-005**: System MUST generate a workspace-level changelog aggregating all changes
- **FR-006**: System MUST create GitHub releases when packages are published
- **FR-007**: System MUST support pre-release versions with identifiers (alpha, beta, rc) via `--preid` flag at workflow trigger time; version plan files specify bump type (e.g., `prerelease`, `preminor`), workflow applies preid globally
- **FR-008**: System MUST allow excluding specific packages from the release process
- **FR-009**: System MUST create git tags following the pattern `{packageName}@{version}`
- **FR-010**: System MUST support dry-run mode to preview changes without committing
- **FR-011**: System MUST publish packages to npm with provenance enabled
- **FR-012**: System MUST support manual workflow dispatch to trigger release preparation
- **FR-013**: CI MUST validate that version plan files exist for all changed packages via `nx release plan:check`, failing the build if missing

### Key Entities

- **Version Plan File**: A markdown file in `.nx/version-plans/` with YAML front matter specifying package name(s) and bump type(s), plus markdown body describing changes for changelog. Created via `nx release plan` command. Consumed and deleted during release.
- **Release PR**: A pull request containing all version updates, changelog updates, lockfile changes, and deletion of consumed version plan files
- **Package Release**: The published state of a package including npm publication, git tag, and GitHub release

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can complete the version bump entry process in under 1 minute
- **SC-002**: Release preparation workflow completes successfully for all packages within 5 minutes
- **SC-003**: 100% of releases correctly apply the specified bump type without automatic escalation
- **SC-004**: All published packages have corresponding git tags and GitHub releases
- **SC-005**: Zero manual intervention required between release PR merge and npm publication
- **SC-006**: Workflow matches developer familiarity from changeset (similar commands and PR-based flow)

## Assumptions

- The nx release tooling (already added as devDependency) provides the necessary functionality for independent package versioning
- The existing CI/CD infrastructure (GitHub Actions) is sufficient for the release workflows
- NPM_TOKEN secret is already configured in the repository for npm publishing
- Developers are familiar with the changeset workflow and expect similar patterns
- The monorepo structure with packages/* workspace pattern remains unchanged

## Out of Scope

- Migration of historical changelogs from changeset format
- Automatic conversion of existing changeset files to nx release format
- Changes to the package structure or workspace configuration
- Version synchronization or "fixed" versioning mode (remaining with independent versioning)
