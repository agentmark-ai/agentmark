# Feature Specification: Existing Repository Initialization

**Feature Branch**: `006-existing-repo-init`
**Created**: 2026-01-10
**Status**: Draft
**Input**: User description: "create agentmark should work in pre-existing repositories (for both python/typescript). Even if users already have an app w/ packages/etc."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initialize AgentMark in Existing TypeScript Project (Priority: P1)

A developer has an existing TypeScript/Node.js application (e.g., Next.js, Express, NestJS) and wants to add AgentMark prompt management capabilities without disrupting their current project structure, dependencies, or configurations.

**Why this priority**: This is the most common use case - developers typically discover AgentMark when they already have a working application and want to add AI prompt capabilities. Breaking their existing setup would prevent adoption.

**Independent Test**: Can be fully tested by running `npx create-agentmark` in any existing TypeScript project and verifying the project still builds, runs, and has functional AgentMark integration.

**Acceptance Scenarios**:

1. **Given** a TypeScript project with existing `package.json`, `tsconfig.json`, and source files, **When** the user runs `npx create-agentmark`, **Then** AgentMark is initialized in the current directory without overwriting existing files.

2. **Given** a project with existing npm dependencies, **When** AgentMark dependencies are installed, **Then** only AgentMark-specific packages are added and existing dependencies remain unchanged.

3. **Given** a project with existing npm scripts (e.g., `dev`, `build`, `test`), **When** AgentMark is initialized, **Then** existing scripts are preserved and AgentMark scripts are added with non-conflicting names.

4. **Given** a project with an existing `.gitignore`, **When** AgentMark is initialized, **Then** AgentMark-specific entries are appended without removing existing entries.

---

### User Story 2 - Initialize AgentMark in Existing Python Project (Priority: P1)

A developer has an existing Python application (e.g., FastAPI, Django, Flask) and wants to add AgentMark prompt management capabilities without disrupting their current project structure, virtual environment, or configurations.

**Why this priority**: Python developers are equally important users. Many ML/AI applications are Python-based, making this a critical path for adoption.

**Independent Test**: Can be fully tested by running `npx create-agentmark --python` in any existing Python project and verifying the project still works and has functional AgentMark integration.

**Acceptance Scenarios**:

1. **Given** a Python project with existing `pyproject.toml` or `requirements.txt`, **When** the user runs `npx create-agentmark --python`, **Then** AgentMark is initialized without overwriting existing dependency files.

2. **Given** a Python project with an existing virtual environment, **When** AgentMark is initialized, **Then** the existing virtual environment is detected and used (not overwritten).

3. **Given** a project with existing source files, **When** AgentMark is initialized, **Then** no existing source files are modified or deleted.

---

### User Story 3 - Initialize in Current Directory (Priority: P2)

A developer wants to add AgentMark to their current working directory rather than creating a new subdirectory, enabling seamless integration into their existing project.

**Why this priority**: Developers working in monorepos or established projects need to initialize "in place" rather than creating nested directories.

**Independent Test**: Can be tested by selecting "." or current directory option during initialization and verifying AgentMark files are created alongside existing project files.

**Acceptance Scenarios**:

1. **Given** a user is in their project root directory, **When** they run `npx create-agentmark` and choose "." as the folder name, **Then** AgentMark files are created in the current directory.

2. **Given** a user provides "." as the folder name, **When** initialization completes, **Then** no parent directory navigation is shown in the "Next Steps" output (no `cd` instruction needed).

---

### User Story 4 - Graceful Conflict Detection (Priority: P2)

When initializing AgentMark in an existing repository, the system should detect potential conflicts and either handle them gracefully or inform the user, preventing accidental data loss.

**Why this priority**: Protecting user's existing work is critical for trust. Silent overwrites could cause significant frustration and lost work.

**Independent Test**: Can be tested by creating a project with conflicting files (e.g., existing `agentmark.json`) and verifying the system either merges or prompts the user.

**Acceptance Scenarios**:

1. **Given** a project with an existing `agentmark.json` file, **When** the user runs `npx create-agentmark`, **Then** the system prompts the user to confirm overwrite or skip.

2. **Given** a project with an existing `agentmark/` directory, **When** the user runs `npx create-agentmark`, **Then** the system warns the user and asks whether to merge or skip example prompts.

3. **Given** a project with an existing `.env` file, **When** AgentMark is initialized with an API key, **Then** the system appends new entries rather than overwriting the entire file.

---

### Edge Cases

- What happens when the user runs `create-agentmark` in a directory without write permissions?
- How does the system handle a project using yarn, pnpm, or bun instead of npm?
- What happens if `package.json` exists but is malformed JSON?
- How does initialization behave in a git submodule or worktree?
- What happens if there's an existing `index.ts` file that would conflict with the generated one?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect if running in an existing project (presence of `package.json` for TypeScript or `pyproject.toml`/`requirements.txt` for Python)

- **FR-002**: System MUST preserve all existing files unless explicitly confirmed by the user to overwrite

- **FR-003**: System MUST merge new dependencies into existing `package.json` rather than replacing it

- **FR-004**: System MUST preserve existing npm scripts and add AgentMark scripts with prefixed names if conflicts exist (e.g., `agentmark:dev` instead of `dev` if `dev` already exists)

- **FR-005**: System MUST append to existing `.gitignore` rather than replacing it

- **FR-006**: System MUST append to existing `.env` files rather than replacing them

- **FR-007**: System MUST allow initialization in the current directory by accepting "." as the folder name

- **FR-008**: System MUST detect conflicting files (`agentmark.json`, `agentmark/` directory, `agentmark.client.ts`) and prompt user for resolution

- **FR-009**: System MUST skip generating `index.ts` in existing projects to avoid overwriting user's entry point

- **FR-010**: System MUST detect existing Python virtual environments (`.venv/`, `venv/`) and not create new ones

- **FR-011**: System MUST support common package managers (npm, yarn, pnpm) by detecting lock files and using the appropriate tool

- **FR-012**: System MUST provide clear error messages when initialization cannot proceed (e.g., no write permissions)

### Key Entities

- **Existing Project**: A directory containing existing source code, configuration files, and dependencies that should be preserved
- **Conflict File**: Any file that AgentMark would normally create but already exists in the target directory
- **Package Manager**: The tool used to manage dependencies (npm, yarn, pnpm, bun) - detected via lock files

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can initialize AgentMark in an existing TypeScript project in under 3 minutes without manual conflict resolution

- **SC-002**: Zero existing files are overwritten without explicit user confirmation

- **SC-003**: Existing projects continue to build and run successfully after AgentMark initialization (no breaking changes introduced)

- **SC-004**: 95% of initialization attempts in existing projects complete successfully without errors

- **SC-005**: Users can run `npm run agentmark:dev` (or equivalent) immediately after initialization without additional configuration

- **SC-006**: Support for the 3 most common package managers (npm, yarn, pnpm) covers 99% of user projects

## Assumptions

- Users have Node.js 18+ installed (required for AgentMark)
- Existing TypeScript projects use standard `tsconfig.json` configurations
- Existing Python projects follow standard packaging conventions
- Users have appropriate file system permissions in their project directories
- The existing project's package manager is one of: npm, yarn, pnpm, or bun

## Out of Scope

- Migrating existing prompt files from other formats to AgentMark MDX
- Automatic detection and resolution of dependency version conflicts
- Support for non-standard project structures (e.g., custom monorepo configurations)
- Rollback functionality if initialization fails partway through
