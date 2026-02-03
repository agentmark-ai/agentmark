# Feature Specification: Dev Entry Tracking & Cloudflared Tunneling

**Feature Branch**: `001-cloudflared-dev-entry`
**Created**: 2026-01-29
**Status**: Draft
**Input**: User description: "dev-entry needs to be removed from gitignore on create + Switch to Cloudflared from Local Tunnel"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Version Control Dev Entry Configuration (Priority: P1)

As a developer, I want the dev-entry.ts file to be tracked in version control so that my team shares the same development server configuration and can customize it without regenerating.

**Why this priority**: This ensures consistent development environments across team members and enables customization of the webhook server entry point without losing changes on regeneration.

**Independent Test**: Can be fully tested by running `create-agentmark` initialization and verifying the dev-entry.ts file is not gitignored and can be committed to the repository.

**Acceptance Scenarios**:

1. **Given** a user runs `npx create-agentmark` to initialize a new project, **When** the initialization completes, **Then** the dev-entry.ts file is created in a location that is NOT gitignored and can be committed to version control.

2. **Given** an existing project with dev-entry.ts in .agentmark/ directory, **When** a user adds AgentMark to their project, **Then** the dev-entry.ts file should be placed in a tracked location and the .gitignore should not ignore it.

3. **Given** a developer modifies their dev-entry.ts with custom configuration, **When** they commit and push to their repository, **Then** their teammates can pull and use the same customized dev server configuration.

---

### User Story 2 - Reliable Public Tunnel with Cloudflared (Priority: P2)

As a developer, I want to use Cloudflared for creating public tunnels during development so that I have a more reliable and stable connection for webhook testing with external services.

**Why this priority**: Cloudflared provides better reliability, faster connections, and is backed by Cloudflare's infrastructure compared to localtunnel which can be unreliable and has dependency vulnerabilities.

**Independent Test**: Can be fully tested by running `agentmark dev --tunnel` and verifying a Cloudflare tunnel URL is created and routes traffic correctly to the local webhook server.

**Acceptance Scenarios**:

1. **Given** a developer runs `agentmark dev --tunnel`, **When** the tunnel is established, **Then** they receive a Cloudflare tunnel URL (e.g., `*.trycloudflare.com`) that routes to their local webhook server.

2. **Given** an external service sends a webhook to the Cloudflare tunnel URL, **When** the request arrives, **Then** it is correctly proxied to the local webhook server and processed.

3. **Given** the tunnel connection is interrupted, **When** the connection is restored, **Then** the tunnel automatically reconnects without manual intervention.

4. **Given** a developer stops the dev server (Ctrl+C), **When** the shutdown completes, **Then** the Cloudflare tunnel is cleanly disconnected.

---

### Edge Cases

- What happens when Cloudflared binary is not installed? System prompts for consent and automatically downloads the binary to a local cache.
- How does the system handle Cloudflared service unavailability? Display a clear error message and continue in local-only mode.
- What happens if the user has both old localtunnel config and new cloudflared? System should migrate cleanly without conflicts.
- What happens to existing projects with dev-entry.ts in .agentmark/? Existing projects continue to work; the dev command checks both old and new locations for backward compatibility.

## Requirements *(mandatory)*

### Functional Requirements

**Dev Entry Version Control:**

- **FR-001**: System MUST generate dev-entry.ts at the project root (alongside agentmark.client.ts)
- **FR-002**: System MUST NOT include dev-entry.ts or its containing location in the default .gitignore entries
- **FR-003**: System MUST preserve existing dev-entry.ts customizations when present (not overwrite on subsequent runs)
- **FR-004**: The `agentmark dev` command MUST continue to locate and use the dev-entry.ts file from its new location

**Cloudflared Tunneling:**

- **FR-005**: System MUST use Cloudflared instead of localtunnel for creating public tunnels when `--tunnel` flag is used
- **FR-006**: System MUST display the Cloudflare tunnel URL to the user upon successful tunnel creation
- **FR-007**: System MUST handle tunnel connection failures gracefully with retry logic and clear error messages
- **FR-008**: System MUST cleanly disconnect the Cloudflare tunnel when the dev server is stopped
- **FR-009**: System MUST automatically download the cloudflared binary on first use when not available, after prompting the user for consent
- **FR-010**: System MUST remove the localtunnel dependency from the project

### Key Entities

- **Dev Entry File**: The TypeScript entry point file for the development webhook server containing client configuration and server initialization
- **Tunnel Configuration**: Settings for creating public tunnels including provider type, port mapping, and connection options
- **Public URL**: The externally accessible URL provided by the tunneling service that routes to the local development server

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New projects created with `create-agentmark` have dev-entry.ts in a version-controlled location (100% of new projects)
- **SC-002**: Developers can successfully create Cloudflare tunnels using `agentmark dev --tunnel` on first attempt (>95% success rate under normal network conditions)
- **SC-003**: Tunnel connection time from command execution to receiving a public URL is under 10 seconds
- **SC-004**: External webhook requests reach the local dev server through the tunnel without modification (100% request fidelity)
- **SC-005**: Tunnel automatically recovers from network interruptions within 30 seconds
- **SC-006**: The localtunnel package and its vulnerable axios dependency are removed from the project dependencies

## Clarifications

### Session 2026-01-29

- Q: Where should dev-entry.ts be placed? → A: Project root (alongside agentmark.client.ts)
- Q: How should cloudflared availability be handled? → A: Automatic download on first use with user consent prompt

## Assumptions

- Cloudflared's free tier (`trycloudflare.com`) is suitable for development purposes and does not require authentication
- Users have network access to Cloudflare's services from their development environment
- The dev-entry.ts file will be placed at project root alongside agentmark.client.ts
- Existing projects can continue to use dev-entry.ts from `.agentmark/` directory for backward compatibility, but new projects will use the tracked location
