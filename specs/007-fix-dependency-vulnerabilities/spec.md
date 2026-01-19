# Feature Specification: Fix Dependency Security Vulnerabilities

**Feature Branch**: `007-fix-dependency-vulnerabilities`
**Created**: 2026-01-16
**Status**: Draft
**Input**: User description: "Fix critical and high severity security vulnerabilities in npm dependencies including Next.js RCE, MCP SDK ReDoS, Hono JWT vulnerabilities, axios SSRF, and other dependency security issues"

## Clarifications

### Session 2026-01-16

- Q: What is the strategy when a vulnerability fix requires major version upgrades with breaking API changes? → A: Update dependency AND fix any breaking changes in the codebase
- Q: How should transitive dependency vulnerabilities be addressed? → A: Prefer updating parent direct dependency; use yarn resolutions/overrides only if parent hasn't updated
- Q: Should development-only vulnerabilities be treated with the same urgency as production? → A: Production first; fix dev vulnerabilities as lower priority (P3)
- Q: What should happen if a vulnerability has no patched version available? → A: Document as accepted risk with tracking issue for follow-up

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Eliminate Critical Remote Code Execution Risks (Priority: P1)

As a developer using agentmark, I need the application to be free of critical remote code execution (RCE) vulnerabilities so that attackers cannot execute arbitrary code on my system or servers.

**Why this priority**: RCE vulnerabilities are the most severe security risks, allowing complete system compromise. The Next.js RCE vulnerability (CVE affecting React flight protocol) must be addressed immediately as it could allow attackers to execute malicious code.

**Independent Test**: Can be verified by running `yarn npm audit` and confirming zero critical severity vulnerabilities, and by checking that Next.js version is updated to a patched release.

**Acceptance Scenarios**:

1. **Given** the project dependencies are installed, **When** running a security audit, **Then** no critical severity vulnerabilities are reported
2. **Given** the Next.js dependency is examined, **When** checking its version, **Then** it is updated to a version that patches the React flight protocol RCE (CVE)
3. **Given** the application is running, **When** handling malicious React flight protocol requests, **Then** the system rejects them without executing arbitrary code

---

### User Story 2 - Resolve High Severity Authentication and Authorization Vulnerabilities (Priority: P1)

As a developer building authentication features with agentmark, I need JWT and authentication-related vulnerabilities fixed so that attackers cannot bypass authentication or forge tokens.

**Why this priority**: Authentication bypass vulnerabilities (Hono JWT issues) could allow unauthorized access to protected resources, compromising user data and system integrity.

**Independent Test**: Can be verified by confirming Hono dependency is updated to patched versions and testing that JWT validation properly checks algorithm headers.

**Acceptance Scenarios**:

1. **Given** the Hono dependency is examined, **When** checking its version, **Then** it is updated to versions patching JWT algorithm confusion vulnerabilities
2. **Given** JWT tokens are processed, **When** an attacker attempts algorithm confusion attacks, **Then** the system properly validates and rejects malicious tokens
3. **Given** JWK authentication is configured, **When** a JWK lacks "alg" field, **Then** the system uses secure defaults instead of trusting untrusted header.alg

---

### User Story 3 - Fix High Severity Denial of Service Vulnerabilities (Priority: P2)

As an operator running agentmark in production, I need denial of service (DoS) vulnerabilities fixed so that malicious actors cannot crash or degrade the service.

**Why this priority**: DoS vulnerabilities can make the application unavailable, affecting all users. Multiple dependencies have DoS risks including axios data size issues, qs memory exhaustion, MCP SDK ReDoS, and Next.js server component vulnerabilities.

**Independent Test**: Can be verified by running security audit and confirming all DoS-related high severity issues are resolved.

**Acceptance Scenarios**:

1. **Given** the MCP SDK is used, **When** processing potentially malicious input, **Then** ReDoS attacks cannot cause extended processing times
2. **Given** axios handles HTTP requests, **When** receiving large responses, **Then** the system properly limits data size to prevent memory exhaustion
3. **Given** the qs library parses query strings, **When** processing bracket notation, **Then** arrayLimit is enforced preventing memory exhaustion
4. **Given** Next.js server components are used, **When** handling malicious requests, **Then** the system remains responsive without denial of service

---

### User Story 4 - Address SSRF and Credential Leakage Risks (Priority: P2)

As a security-conscious developer, I need SSRF (Server-Side Request Forgery) and credential leakage vulnerabilities fixed so that attackers cannot access internal resources or steal credentials.

**Why this priority**: SSRF vulnerabilities can allow attackers to access internal services, metadata endpoints, or leak sensitive credentials through crafted requests.

**Independent Test**: Can be verified by confirming axios version is updated to patch absolute URL handling vulnerabilities.

**Acceptance Scenarios**:

1. **Given** axios makes HTTP requests, **When** an absolute URL is provided, **Then** the system properly validates it without SSRF or credential leakage
2. **Given** MCP SDK is used, **When** DNS rebinding attacks are attempted, **Then** DNS rebinding protection prevents unauthorized access

---

### User Story 5 - Resolve Moderate Security Issues (Priority: P3)

As a developer, I need moderate severity vulnerabilities addressed to maintain overall security posture and prevent exploitation of lower-severity issues.

**Why this priority**: While less severe individually, moderate vulnerabilities can be chained together or exploited under specific conditions.

**Independent Test**: Can be verified by running security audit and confirming all moderate severity issues are resolved or documented as acceptable risk.

**Acceptance Scenarios**:

1. **Given** body-parser processes requests, **When** URL encoding is used, **Then** the system is protected from denial of service
2. **Given** jsondiffpatch generates HTML output, **When** rendering diffs, **Then** XSS attacks are prevented
3. **Given** mdast-util-to-hast processes markdown, **When** generating HTML, **Then** class attributes are properly sanitized

---

### Edge Cases

- When a dependency update introduces breaking API changes, the codebase MUST be updated to maintain compatibility (no deferred updates for security fixes)
- For transitive dependency vulnerabilities: first attempt to update the parent direct dependency; if unavailable, use yarn resolutions/overrides to force patched versions
- Development-only vulnerabilities (Storybook, js-yaml dev, glob dev) are treated as lower priority (P3); production vulnerabilities take precedence
- If a vulnerability has no patched version available, document as accepted risk and create a tracking issue for follow-up when a fix becomes available

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST update Next.js to a version that patches the React flight protocol RCE vulnerability
- **FR-002**: System MUST update Next.js to a version that patches server component DoS vulnerabilities
- **FR-003**: System MUST update Next.js to a version that patches server actions source code exposure
- **FR-004**: System MUST update Hono to a version that patches JWT algorithm confusion vulnerabilities (both JWK auth middleware and JWT middleware issues)
- **FR-005**: System MUST update @modelcontextprotocol/sdk to a version that patches ReDoS vulnerability
- **FR-006**: System MUST update @modelcontextprotocol/sdk to enable DNS rebinding protection by default
- **FR-007**: System MUST update axios to a version that patches SSRF, credential leakage, DoS, and CSRF vulnerabilities
- **FR-008**: System MUST update qs to a version that patches arrayLimit bypass DoS vulnerability
- **FR-009**: System MUST update braces to a version that patches uncontrolled resource consumption vulnerability
- **FR-010**: System MUST update glob to a version that patches command injection vulnerability
- **FR-011**: System MUST update body-parser to a version that patches URL encoding DoS vulnerability
- **FR-012**: System MUST update mdast-util-to-hast to a version that patches unsanitized class attribute vulnerability
- **FR-013**: System MUST update jsondiffpatch to a version that patches XSS vulnerability
- **FR-014**: System MUST update micromatch to a version that patches ReDoS vulnerability
- **FR-015**: System MUST update js-yaml to a version that patches prototype pollution vulnerability
- **FR-016**: System MUST update prismjs to a version that patches DOM clobbering vulnerability
- **FR-017**: System SHOULD update Vercel AI SDK to a version that patches filetype whitelist bypass vulnerability IF compatible with ai-sdk-v4-adapter peerDep constraints; otherwise document as accepted risk
- **FR-018**: System MUST update Storybook to a version that patches environment variable exposure vulnerability
- **FR-019**: System MUST ensure all dependency updates maintain compatibility with existing functionality
- **FR-020**: System MUST regenerate yarn.lock to reflect updated dependency versions
- **FR-021**: System MUST pass all existing tests after dependency updates

### Key Entities

- **Vulnerability**: Security issue identified in a dependency, characterized by severity (critical/high/moderate/low), CVE identifier, affected package, and affected version range
- **Dependency**: npm package used by the project, either direct (in package.json) or transitive (in yarn.lock)
- **Security Advisory**: Official notification of a vulnerability with remediation guidance and fixed version information

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Security audit reports zero critical severity vulnerabilities
- **SC-002**: Security audit reports zero high severity vulnerabilities in production dependencies
- **SC-003**: All existing tests continue to pass after dependency updates
- **SC-004**: Application builds successfully with updated dependencies
- **SC-005**: No new vulnerabilities are introduced by the dependency updates
- **SC-006**: Total count of moderate and low severity vulnerabilities is reduced by at least 80%
- **SC-007**: All direct dependency updates are reflected in both package.json files and yarn.lock
