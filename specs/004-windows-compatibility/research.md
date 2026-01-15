# Research: Windows Compatibility

**Feature**: 004-windows-compatibility
**Date**: 2026-01-10
**Status**: Complete

## Executive Summary

The AgentMark codebase contains numerous Unix-specific patterns that prevent Windows developers from running the development environment. This research documents all identified issues and recommends cross-platform solutions.

## Issue Categories

### 1. Environment Variable Syntax

**Problem**: Unix uses `VAR=value command` syntax; Windows uses different approaches per shell.

| File | Line | Current | Issue |
|------|------|---------|-------|
| `package.json` | 17 | `YARN_ENABLE_IMMUTABLE_INSTALLS=false && yarn` | Unix-only syntax |
| `packages/mcp-server/package.json` | 16 | `RUN_INTEGRATION_TESTS=true vitest run` | Unix-only syntax |

**Solution**: Use `cross-env` package
```json
"test:integration": "cross-env RUN_INTEGRATION_TESTS=true vitest run test/integration"
```

### 2. File Permission Commands (chmod)

**Problem**: Unix file permissions (octal 755) have no Windows equivalent.

| File | Lines | Usage |
|------|-------|-------|
| `packages/cli/package.json` | 17-19 | `chmodSync('dist/index.js', '755')` |
| `packages/create-agentmark/package.json` | 13, 16-17 | `chmodSync('dist/index.js', '755')` |

**Solution**: Platform-conditional chmod
```javascript
// In a build script
if (process.platform !== 'win32') {
  fs.chmodSync('dist/index.js', '755');
}
```

Or use `shx` package:
```json
"build": "shx rm -rf dist && tsc && shx chmod 755 dist/index.js || true"
```

### 3. Python Virtual Environment Paths

**Problem**: Unix venv uses `.venv/bin/`, Windows uses `.venv/Scripts/`.

| File | Lines | Current Path |
|------|-------|--------------|
| `packages/sdk-python/package.json` | 6-12 | `.venv/bin/pip`, `.venv/bin/pytest` |
| `packages/templatedx-python/package.json` | 6-9 | `.venv/bin/pip`, `.venv/bin/pytest` |
| `packages/prompt-core-python/package.json` | 6-9 | `.venv/bin/pip`, `.venv/bin/pytest` |
| `packages/pydantic-ai-v0-adapter/package.json` | 6-13 | `.venv/bin/pip`, `.venv/bin/pytest` |

**Solution Options**:

**A. Node.js wrapper script** (Recommended)
```javascript
// scripts/run-python.js
const { execSync } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';
const venvPath = isWindows ? '.venv\\Scripts' : '.venv/bin';
const command = process.argv.slice(2).join(' ');

execSync(`${path.join(venvPath, command)}`, { stdio: 'inherit' });
```

**B. npm-run-all with platform scripts**
```json
{
  "test": "run-s test:*",
  "test:unix": "[ \"$(uname)\" != 'Windows_NT' ] && .venv/bin/pytest || exit 0",
  "test:win": "[ \"$(uname)\" = 'Windows_NT' ] && .venv\\Scripts\\pytest || exit 0"
}
```

### 4. Shell Commands (rm, mkdir, cp)

**Problem**: Commands like `rm -rf` aren't available on Windows cmd.

| Command | Files Affected | Occurrences |
|---------|---------------|-------------|
| `rm -rf` | sdk-python, pydantic-ai-v0-adapter | 2 |
| `chmod` | cli, create-agentmark | 4 |

**Solution**: Use `shx` or `rimraf` packages
```json
"clean": "shx rm -rf .venv dist *.egg-info"
// or
"clean": "rimraf .venv dist *.egg-info"
```

### 5. Bash Scripts

**Problem**: `.specify/scripts/bash/*.sh` scripts use bash-specific syntax.

| Script | Critical Patterns |
|--------|-------------------|
| `common.sh` | Bash functions, color codes |
| `setup-plan.sh` | `source`, eval, bash conditionals |
| `check-prerequisites.sh` | `source`, command existence checks |
| `update-agent-context.sh` | `/tmp`, `mktemp`, `sed -i`, complex grep/sed |
| `create-new-feature.sh` | `tr`, `sed`, regex patterns, git operations |

**Solution Options**:

**A. Keep bash, require Git Bash on Windows** (Simplest)
- Document that Windows users must use Git Bash
- Scripts remain unchanged
- Caveat: Adds setup requirement

**B. Create Node.js equivalents** (Most compatible)
- Create `.specify/scripts/node/` directory
- Rewrite scripts in JavaScript
- Use `cross-spawn`, `fs-extra`, `glob` packages

**C. PowerShell alternatives** (Windows-native)
- Create `.specify/scripts/powershell/` directory
- More complex to maintain two script sets

**Recommendation**: Option A for MVP, Option B for full compatibility.

### 6. CI/CD Workflow

**Problem**: GitHub Actions workflow uses bash syntax and only runs on Ubuntu.

| File | Issue |
|------|-------|
| `.github/workflows/ci.yml` | Lines 40-46: Bash for loop; Line 54: .sh script |

**Solution**: Add Windows to matrix, use cross-platform commands

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      # Use shell: bash on all platforms for script compatibility
      - run: |
          for i in $(seq 1 30); do
            curl -s http://localhost:9419/health && break || sleep 1
          done
        shell: bash
```

## Recommended Packages

| Package | Purpose | Size Impact |
|---------|---------|-------------|
| `cross-env` | Cross-platform env vars | ~3KB |
| `shx` | Portable shell commands | ~15KB |
| `rimraf` | Cross-platform rm -rf | ~20KB |
| `cross-spawn` | Cross-platform spawn | ~10KB |

## Implementation Priority

### P1 - Required for basic functionality
1. Add `cross-env` to root devDependencies
2. Fix env var syntax in package.json scripts
3. Make chmod platform-conditional
4. Add Windows to CI matrix

### P2 - Required for Python development
5. Create cross-platform Python venv helper
6. Update all Python package scripts

### P3 - Nice to have
7. Create Node.js versions of bash scripts
8. Update documentation with Windows instructions

## Testing Strategy

1. **Local Testing**:
   - Set up Windows VM or use Windows Sandbox
   - Clone repo, run `yarn install`, `yarn build`, `yarn test`

2. **CI Testing**:
   - Add `windows-latest` to GitHub Actions matrix
   - Run TypeScript tests on Windows
   - Run Python tests on Windows (if Python packages used)

3. **Shell Compatibility**:
   - Test on PowerShell 7+
   - Test on Command Prompt
   - Test on Git Bash

## References

- [cross-env npm package](https://www.npmjs.com/package/cross-env)
- [shx npm package](https://www.npmjs.com/package/shx)
- [Node.js process.platform](https://nodejs.org/api/process.html#processplatform)
- [Python venv on Windows](https://docs.python.org/3/library/venv.html)
- [GitHub Actions Windows runners](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners)
