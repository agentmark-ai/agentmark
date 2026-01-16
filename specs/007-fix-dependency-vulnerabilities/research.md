# Research: Dependency Security Vulnerability Fixes

**Feature**: 007-fix-dependency-vulnerabilities
**Date**: 2026-01-16

## Critical Vulnerabilities

### Next.js RCE (CVE-2025-55182, CVE-2025-67779)

**Decision**: Update next to 15.5.9 (latest patch for 15.5.x line)

**Rationale**:
- CVE-2025-55182 is a critical CVSS 10.0 vulnerability in React Server Components
- The vulnerability allows unauthenticated remote code execution via the Flight protocol
- Initial fix (15.5.7) was incomplete; CVE-2025-67779 addresses remaining issues
- Active exploitation observed in the wild including reverse shells and cryptomining

**Fixed Versions**:
- 15.0.7 (15.0.x), 15.1.11 (15.1.x), 15.2.8 (15.2.x), 15.3.8 (15.3.x), 15.4.10 (15.4.x), **15.5.9 (15.5.x)**, 16.0.10 (16.0.x)

**Source**: [Next.js Security Update: December 11, 2025](https://nextjs.org/blog/security-update-2025-12-11)

**Breaking Changes**: None expected for patch version update within same minor

---

## High Severity Vulnerabilities

### @modelcontextprotocol/sdk (CVE-2025-66414, ReDoS)

**Decision**: Update @modelcontextprotocol/sdk to ^1.25.2

**Rationale**:
- CVE-2025-66414: DNS rebinding protection not enabled by default (fixed in 1.24.0)
- ReDoS vulnerability in UriTemplate regex patterns (fixed in 1.25.2)
- Direct dependency in packages/mcp-server
- Transitive dependency via @mastra/mcp requires resolution

**Fixed Versions**: 1.24.0+ (DNS rebinding), 1.25.2+ (ReDoS)

**Source**: [GitHub Release v1.25.2](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v1.25.2)

**Breaking Changes**: May need to review HTTP server configuration if using StreamableHTTPServerTransport

---

### Storybook (CVE-2025-68429)

**Decision**: Update storybook to ^9.1.17

**Rationale**:
- Environment variables from .env files could be bundled into storybook build artifacts
- Secrets could be exposed in published Storybooks
- Development-only dependency but should still be fixed

**Fixed Versions**: 7.6.21+, 8.6.15+, **9.1.17+**, 10.1.10+

**Source**: [Storybook Security Advisory](https://storybook.js.org/blog/security-advisory/)

**Breaking Changes**:
- Non-STORYBOOK_-prefixed env vars no longer automatically available
- May need to prefix env vars with STORYBOOK_ or use `env` config property

---

### axios (Multiple CVEs)

**Decision**: Use yarn resolutions to force axios@^1.7.9

**Rationale**:
- CVE-2024-39338: SSRF via absolute URL (fixed in 0.30.0)
- CVE-2024-XXXX: DoS via lack of data size check (fixed in 0.30.2)
- CVE-2024-XXXX: CSRF vulnerability (fixed in 0.28.0)
- Transitive dependency via localtunnel@2.0.2 which pulls axios@0.21.4
- localtunnel hasn't updated; must use resolution

**Fixed Version**: 1.7.9 (already in packages/cli overrides)

**Action**: Add yarn resolution at root level for all workspaces

---

### Hono (GHSA-3vhc-576x-3qv4, GHSA-f67f-6cw9-8mq4)

**Decision**: Use yarn resolutions to force hono@^4.11.4

**Rationale**:
- GHSA-3vhc-576x-3qv4: JWK Auth Middleware JWT algorithm confusion when JWK lacks "alg"
- GHSA-f67f-6cw9-8mq4: JWT Middleware algorithm confusion via unsafe HS256 default allows token forgery
- Transitive dependency via @mastra/core@0.13.2 which pulls hono@4.10.5
- @mastra/core hasn't updated; must use resolution

**Fixed Version**: 4.11.4+

**Source**: [GHSA-3vhc-576x-3qv4](https://github.com/advisories/GHSA-3vhc-576x-3qv4), [GHSA-f67f-6cw9-8mq4](https://github.com/advisories/GHSA-f67f-6cw9-8mq4)

**Breaking Changes**: None expected for minor version update

---

### qs (CVE-2025-XXXX)

**Decision**: Use yarn resolutions to force qs@^6.14.1

**Rationale**:
- arrayLimit bypass allows DoS via memory exhaustion
- Transitive dependency via express
- Current versions: 6.13.0, 6.14.0

**Fixed Version**: 6.14.1+

**Action**: Add yarn resolution at root level

---

## Moderate Severity Vulnerabilities

### body-parser

**Decision**: Use yarn resolution if needed; may be resolved by express update

**Current**: 2.2.0 → **Fixed**: 2.2.1+
**Issue**: URL encoding DoS vulnerability

---

### mdast-util-to-hast

**Decision**: Use yarn resolution to force ^13.2.1

**Current**: 13.2.0 → **Fixed**: 13.2.1+
**Issue**: Unsanitized class attribute
**Location**: Transitive via react-markdown

---

### jsondiffpatch

**Decision**: Use yarn resolution to force ^0.7.2

**Current**: 0.6.0 → **Fixed**: 0.7.2+
**Issue**: XSS vulnerability in HtmlFormatter
**Location**: Transitive via ai SDK

---

### micromatch

**Decision**: Use yarn resolution to force ^4.0.8

**Current**: 2.3.11, 3.1.10 → **Fixed**: 4.0.8+
**Issue**: ReDoS vulnerability
**Location**: Transitive via old chokidar/readdirp deps

---

### js-yaml

**Decision**: Use yarn resolution to force ^3.14.2

**Current**: 3.14.1 → **Fixed**: 3.14.2+
**Issue**: Prototype pollution in merge
**Location**: Transitive via front-matter
**Note**: Cannot use js-yaml 4.x as it removes `safeLoad` API used by front-matter package

---

### prismjs

**Decision**: Use yarn resolution to force ^1.30.0

**Current**: 1.27.0 → **Fixed**: 1.30.0+
**Issue**: DOM clobbering vulnerability
**Location**: Transitive via refractor@3.6.0

---

## Low Severity / Deprecations

### ai SDK (filetype whitelist bypass)

**Decision**: Document as known issue; update when v5 adapter permits

**Current**: 4.3.19 → **Fixed**: 5.0.52+
**Issue**: Filetype whitelist bypass
**Note**: ai-sdk-v4-adapter has peerDep on ai@^4.0.0; cannot update to v5

---

### Deprecated Packages

| Package | Status | Action |
|---------|--------|--------|
| mdast | Renamed to remark | No action (internal dep) |
| resolve-url | Deprecated | Resolved by parent updates |
| source-map-url | Deprecated | Resolved by parent updates |
| source-map-resolve | Deprecated | Resolved by parent updates |
| urix | Deprecated | Resolved by parent updates |
| @base-ui-components/utils | Renamed | Resolved by @mui update |

---

## Implementation Summary

### Direct Dependency Updates

| Package | Location | Current | Target |
|---------|----------|---------|--------|
| next | packages/cli | 15.5.6 | 15.5.9 |
| eslint-config-next | packages/cli, ui-components | 15.5.6 | 15.5.9 |
| @modelcontextprotocol/sdk | packages/mcp-server | ^1.11.0 | ^1.25.2 |
| storybook (all) | packages/ui-components | 9.1.15/9.1.16 | ^9.1.17 |

### Yarn Resolutions (root package.json)

```json
{
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
}
```

### Accepted Risks

| Package | Issue | Reason |
|---------|-------|--------|
| ai@4.x | filetype bypass | peerDep constraint, v5 not compatible with v4 adapter |

---

## Sources

- [Next.js Security Update: December 11, 2025](https://nextjs.org/blog/security-update-2025-12-11)
- [CVE-2025-66478 Advisory](https://nextjs.org/blog/CVE-2025-66478)
- [MCP SDK GitHub Release v1.25.2](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v1.25.2)
- [CVE-2025-66414 DNS Rebinding Advisory](https://github.com/advisories/GHSA-w48q-cv73-mx4w)
- [Storybook Security Advisory](https://storybook.js.org/blog/security-advisory/)
- [CVE-2025-68429 Storybook Advisory](https://github.com/advisories/GHSA-8452-54wp-rmv6)
