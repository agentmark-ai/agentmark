# Implementation Plan: Fix Dependency Security Vulnerabilities

**Branch**: `007-fix-dependency-vulnerabilities` | **Date**: 2026-01-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-fix-dependency-vulnerabilities/spec.md`

## Summary

Fix critical, high, and moderate severity security vulnerabilities across the agentmark monorepo's npm dependencies. The primary approach is updating direct dependencies to patched versions, with yarn resolutions for transitive dependencies where parent packages haven't updated. Production vulnerabilities take priority over development-only issues.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+
**Primary Dependencies**: yarn 4.5.3 (workspaces), turbo (build orchestration)
**Storage**: N/A (dependency management only)
**Testing**: vitest (all packages)
**Target Platform**: Node.js 18+, browser (for UI components)
**Project Type**: Monorepo with multiple packages
**Performance Goals**: N/A (security focus)
**Constraints**: Must maintain compatibility with existing functionality; all tests must pass
**Scale/Scope**: 21 packages in monorepo, ~25 vulnerabilities to address

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | N/A | No prompt changes |
| II. Adapter Neutrality | N/A | No adapter changes |
| III. Type Safety | ✅ Pass | No type changes expected |
| IV. Testability | ✅ Pass | All existing tests must pass post-update |
| V. Composability | N/A | No component changes |
| VI. Cross-Platform Compatibility | ✅ Pass | Using cross-env, shx already in devDeps |
| Security Standards | ✅ Pass | This feature improves security posture |
| Dependency Management | ✅ Pass | Following semver, documenting breaking changes |

**Gate Result**: PASS - No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/007-fix-dependency-vulnerabilities/
├── plan.md              # This file
├── research.md          # Patched version research
├── quickstart.md        # Verification steps
└── tasks.md             # Task list (from /speckit.tasks)
```

### Source Code (repository root)

```text
# Monorepo structure - files to modify
package.json             # Root devDependencies, resolutions
yarn.lock                # Regenerated lockfile

packages/
├── cli/package.json              # next (critical), express deps
├── mcp-server/package.json       # @modelcontextprotocol/sdk
├── ai-sdk-v4-adapter/package.json # ai SDK
├── ai-sdk-v5-adapter/package.json # ai SDK
├── ui-components/package.json    # storybook, react-markdown deps
├── templatedx/package.json       # mdast deps
└── [other packages as needed]
```

**Structure Decision**: Monorepo with yarn workspaces. Updates will be made to individual package.json files for direct dependencies and root package.json for shared devDependencies and resolutions.

## Vulnerability Summary

### Critical (P1 - Immediate)

| Package | Vulnerability | Current | Fixed | Location |
|---------|--------------|---------|-------|----------|
| next | RCE in React flight protocol | 15.5.6 | >=15.5.7 | packages/cli |

### High (P1/P2)

| Package | Vulnerability | Current | Fixed | Location |
|---------|--------------|---------|-------|----------|
| @modelcontextprotocol/sdk | DNS rebinding, ReDoS | 1.21.1 | >=1.25.2 | transitive (@mastra/mcp) |
| hono | JWT algorithm confusion (JWK auth + JWT middleware) | 4.10.5 | >=4.11.4 | transitive (@mastra/core) |
| axios | SSRF, DoS, credential leakage | 0.21.4 | >=0.30.2 | transitive (localtunnel) |
| qs | arrayLimit bypass DoS | 6.13.0 | >=6.14.1 | transitive (express) |
| storybook | env var exposure | 9.1.16 | >=9.1.17 | packages/ui-components |

### Moderate (P3)

| Package | Vulnerability | Current | Fixed | Location |
|---------|--------------|---------|-------|----------|
| body-parser | URL encoding DoS | 2.2.0 | >=2.2.1 | transitive |
| mdast-util-to-hast | unsanitized class | 13.2.0 | >=13.2.1 | transitive |
| jsondiffpatch | XSS | 0.6.0 | >=0.7.2 | transitive (ai) |
| micromatch | ReDoS | <4.0.8 | >=4.0.8 | transitive |
| js-yaml | prototype pollution | 3.14.1 | >=3.14.2 | transitive |
| prismjs | DOM clobbering | 1.27.0 | >=1.30.0 | transitive |

### Low/Deprecation & Accepted Risks

| Package | Issue | Action |
|---------|-------|--------|
| ai@4.x | filetype whitelist bypass (low severity) | **Accepted Risk**: ai-sdk-v4-adapter requires ai@^4.0.0 peerDep; cannot update to v5 without breaking adapter |
| mdast | Renamed to remark | No action (internal dep, deprecation warning only) |
| Various deprecated packages | Old dependencies | Address via parent updates |

## Complexity Tracking

> No Constitution violations requiring justification.

## Implementation Strategy

1. **Update direct dependencies first** - Next.js, Storybook, MCP SDK direct uses
2. **Use yarn resolutions for stuck transitive deps** - axios (via localtunnel), qs (via express), hono (via @mastra/core)
3. **Test after each major update** - Run `yarn test` and `yarn build` to catch breaking changes
4. **Document any breaking changes** - Fix code as needed per clarification decisions
5. **Final audit verification** - Run `yarn npm audit` to confirm all issues resolved
