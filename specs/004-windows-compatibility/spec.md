# Feature Specification: Windows Compatibility

**Feature Branch**: `004-windows-compatibility`
**Created**: 2026-01-10
**Status**: Draft
**Input**: User description: "The AgentMark repo should be windows compatible (currently mac-specific commands). As a Windows user, I want to be able to run/develop/debug on the agentmark repo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Development Environment on Windows (Priority: P1)

As a Windows developer, I want to clone the AgentMark repository and run the development environment using standard commands so that I can develop and test features locally.

**Why this priority**: This is the fundamental capability - without being able to run the dev environment, no other development work is possible on Windows.

**Independent Test**: Can be fully tested by cloning the repo on Windows, running `yarn install` and `yarn dev`, and verifying the development server starts successfully.

**Acceptance Scenarios**:

1. **Given** a fresh Windows machine with Node.js and Yarn installed, **When** I run `yarn install`, **Then** all dependencies install without platform-specific errors
2. **Given** dependencies are installed, **When** I run `yarn dev`, **Then** the development server starts and is accessible
3. **Given** dependencies are installed, **When** I run `yarn build`, **Then** all packages build successfully without permission errors

---

### User Story 2 - Run Test Suite on Windows (Priority: P1)

As a Windows developer, I want to run the full test suite so that I can verify my changes don't break existing functionality.

**Why this priority**: Testing is critical for development - equal priority with running the dev environment.

**Independent Test**: Can be fully tested by running `yarn test` on Windows and verifying all tests pass.

**Acceptance Scenarios**:

1. **Given** the repo is set up on Windows, **When** I run `yarn test`, **Then** all unit tests execute and pass
2. **Given** the repo is set up on Windows, **When** I run integration tests, **Then** environment variables are set correctly and tests execute
3. **Given** Python packages exist in the repo, **When** I run Python tests, **Then** the virtual environment is created and tests run using Windows paths

---

### User Story 3 - Run CI Workflow Locally on Windows (Priority: P2)

As a Windows developer, I want to run the same commands locally that CI runs so that I can catch issues before pushing.

**Why this priority**: Important for developer experience but not blocking basic development work.

**Independent Test**: Can be fully tested by running build, lint, and test commands and comparing results to CI.

**Acceptance Scenarios**:

1. **Given** the repo is set up on Windows, **When** I run `yarn lint`, **Then** linting completes without platform-specific path errors
2. **Given** the repo is set up on Windows, **When** I run build scripts, **Then** executable permissions are handled appropriately for Windows

---

### User Story 4 - Develop Python Packages on Windows (Priority: P2)

As a Windows developer working on Python packages, I want to set up virtual environments and run Python tooling so that I can contribute to Python-based packages.

**Why this priority**: Subset of users will work on Python packages; core TypeScript development is higher priority.

**Independent Test**: Can be fully tested by navigating to a Python package directory and running `yarn postinstall` followed by `yarn test`.

**Acceptance Scenarios**:

1. **Given** a Python package directory, **When** I run the postinstall script, **Then** a virtual environment is created using Windows-compatible commands
2. **Given** a virtual environment exists, **When** I run Python tests, **Then** pytest executes using the correct Windows path to the venv

---

### Edge Cases

- What happens when running on PowerShell vs Command Prompt vs Git Bash?
- How does the system handle Windows path separators (backslash vs forward slash)?
- What happens when file permissions (chmod) are attempted on Windows?
- How are environment variables set inline with commands on Windows?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All npm/yarn scripts MUST work on Windows without modification by the user
- **FR-002**: Build scripts MUST handle file permissions appropriately on Windows (no chmod errors)
- **FR-003**: Test scripts MUST set environment variables using cross-platform syntax
- **FR-004**: Python package scripts MUST use Windows-compatible virtual environment paths
- **FR-005**: Shell scripts used in development MUST have Windows equivalents, use cross-platform tooling, OR document Git Bash as a requirement for Windows users
- **FR-006**: Path handling in scripts MUST work with both forward and backward slashes
- **FR-007**: CI workflows MUST include Windows in the test matrix to catch platform-specific issues

### Key Entities

- **Package Scripts**: npm scripts in package.json files that execute build, test, and development commands
- **Shell Scripts**: Bash scripts used for development automation
- **Virtual Environments**: Python venv directories with platform-specific binary paths
- **Environment Variables**: Runtime configuration passed to commands

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Windows developer can complete full setup (clone, install, build, test) in under 15 minutes
- **SC-002**: 100% of `yarn test` commands pass on Windows with no platform-specific failures
- **SC-003**: 100% of `yarn build` commands succeed on Windows
- **SC-004**: All documented development workflows work identically on Windows, macOS, and Linux
- **SC-005**: CI includes Windows in test matrix and passes consistently

## Assumptions

- Developers on Windows have Node.js (v18+) and Yarn installed
- Developers may use PowerShell, Command Prompt, or Git Bash
- Python developers have Python 3.8+ installed and accessible from PATH
- Git is installed and configured on Windows machines
- WSL (Windows Subsystem for Linux) is NOT required - native Windows support is expected
