# Quickstart: Verifying Security Vulnerability Fixes

**Feature**: 007-fix-dependency-vulnerabilities
**Date**: 2026-01-16

## Prerequisites

- Node.js 18+
- Yarn 4.5.3+
- Access to the agentmark monorepo

## Verification Steps

### 1. Pre-Update Baseline

Before making any changes, capture the current vulnerability count:

```bash
# Run security audit
yarn npm audit --all --recursive 2>&1 | tee audit-before.txt

# Count vulnerabilities by severity
yarn npm audit --all --recursive 2>&1 | grep -E "^├─|Severity:" | grep -c "critical"
yarn npm audit --all --recursive 2>&1 | grep -E "^├─|Severity:" | grep -c "high"
yarn npm audit --all --recursive 2>&1 | grep -E "^├─|Severity:" | grep -c "moderate"
```

### 2. Apply Updates

```bash
# Update direct dependencies (from feature branch)
yarn install

# Verify lockfile regenerated
git diff yarn.lock
```

### 3. Post-Update Verification

#### 3.1 Security Audit

```bash
# Run security audit again
yarn npm audit --all --recursive 2>&1 | tee audit-after.txt

# Verify critical vulnerabilities = 0
yarn npm audit --all --recursive 2>&1 | grep -c "critical"
# Expected: 0

# Verify high vulnerabilities in production = 0
yarn npm audit --all --recursive 2>&1 | grep "high" | grep -v "Development"
# Expected: Only dev dependencies (storybook related) if any
```

#### 3.2 Build Verification

```bash
# Run full build
yarn build

# Expected: All packages build successfully
```

#### 3.3 Test Verification

```bash
# Run all tests
yarn test

# Expected: All tests pass
```

### 4. Specific Package Verification

#### 4.1 Next.js Version

```bash
# Check Next.js version in CLI package
cat packages/cli/package.json | grep '"next"'
# Expected: "15.5.9" or higher

# Verify no RCE vulnerability
yarn npm audit --all --recursive 2>&1 | grep -i "RCE\|flight protocol"
# Expected: No matches
```

#### 4.2 MCP SDK Version

```bash
# Check MCP SDK version
cat packages/mcp-server/package.json | grep '@modelcontextprotocol/sdk'
# Expected: "^1.25.2" or higher

# Verify no ReDoS or DNS rebinding
yarn npm audit --all --recursive 2>&1 | grep -i "@modelcontextprotocol"
# Expected: No vulnerabilities
```

#### 4.3 Storybook Version

```bash
# Check Storybook version
cat packages/ui-components/package.json | grep '"storybook"'
# Expected: "^9.1.17" or higher

# Verify env var exposure fixed
yarn npm audit --all --recursive 2>&1 | grep -i "storybook.*environment"
# Expected: No matches
```

### 5. Functional Verification

#### 5.1 CLI Functionality

```bash
# Test CLI basic operation
cd packages/cli
yarn build
node dist/index.js --help
# Expected: Help output displays without errors
```

#### 5.2 MCP Server Functionality

```bash
# Test MCP server build
cd packages/mcp-server
yarn build
# Expected: Builds without errors
```

#### 5.3 Storybook Functionality (Development)

```bash
# Test Storybook build
cd packages/ui-components
yarn build-storybook
# Expected: Builds without errors
# Note: Non-STORYBOOK_ prefixed env vars no longer auto-included
```

## Success Criteria Checklist

- [ ] `yarn npm audit` reports 0 critical vulnerabilities
- [ ] `yarn npm audit` reports 0 high vulnerabilities in production deps
- [ ] `yarn build` completes successfully for all packages
- [ ] `yarn test` passes for all packages
- [ ] Next.js updated to 15.5.9+
- [ ] @modelcontextprotocol/sdk updated to 1.25.2+
- [ ] Storybook updated to 9.1.17+
- [ ] Yarn resolutions in place for transitive dependencies
- [ ] Total moderate/low vulnerabilities reduced by ≥80%

## Troubleshooting

### Build Failures After Update

If builds fail after updating:

1. Check for breaking API changes in updated packages
2. Review package changelogs for migration guides
3. Fix code as needed (per clarification: update code to maintain compatibility)

### Resolution Conflicts

If yarn resolutions cause conflicts:

1. Check if the resolution version is compatible with parent packages
2. Consider updating parent packages first
3. Use `yarn why <package>` to understand dependency tree

### Test Failures

If tests fail after update:

1. Check if test mocks need updating for new API versions
2. Review test expectations against new behavior
3. Update tests to match new (secure) behavior

## Rollback Procedure

If critical issues are discovered:

```bash
# Revert to previous state
git checkout main -- package.json yarn.lock packages/*/package.json
yarn install
```
