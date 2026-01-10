# Quickstart: Windows Compatibility

**Feature**: 004-windows-compatibility
**Date**: 2026-01-10

## Overview

This feature enables Windows developers to work on the AgentMark repository using the same commands as macOS/Linux developers. No Windows-specific commands or workarounds are required.

## Quick Verification

After implementation, Windows developers can verify compatibility:

```bash
# Clone and setup
git clone https://github.com/agentmark-ai/agentmark.git
cd agentmark
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Run development server (if applicable)
yarn dev
```

## Key Changes

### 1. Environment Variables

All scripts use `cross-env` for cross-platform environment variables:

```json
// Before (Unix-only)
"test:integration": "RUN_INTEGRATION_TESTS=true vitest run"

// After (cross-platform)
"test:integration": "cross-env RUN_INTEGRATION_TESTS=true vitest run"
```

### 2. File Permissions

Build scripts handle permissions conditionally:

```javascript
// chmod only runs on Unix systems
if (process.platform !== 'win32') {
  fs.chmodSync('dist/index.js', '755');
}
```

### 3. Python Packages

Python packages detect the platform and use correct paths:

```javascript
// Automatically uses correct venv path
// Unix: .venv/bin/python
// Windows: .venv\Scripts\python.exe
```

### 4. Shell Scripts

For `.specify/scripts/bash/*.sh`:
- **Option A**: Use Git Bash on Windows (recommended for MVP)
- **Option B**: Node.js scripts available in `.specify/scripts/node/`

## Supported Shells

| Shell | Support Level |
|-------|---------------|
| Git Bash | Full support |
| PowerShell 7+ | Full support |
| Command Prompt | Limited (use Git Bash for bash scripts) |
| WSL | Full support (runs as Linux) |

## Known Limitations

1. **Bash scripts**: Some automation scripts (like speckit commands) require Git Bash
2. **Symlinks**: May require developer mode on Windows for git symlinks
3. **Line endings**: Configure git to handle line endings (`git config core.autocrlf true`)

## Troubleshooting

### "command not found" errors
- Ensure Node.js and Yarn are in PATH
- Use Git Bash for shell scripts

### Python venv issues
- Run `python -m venv .venv` (not `python3` on Windows)
- Activate: `.venv\Scripts\activate` (PowerShell) or `.venv\Scripts\activate.bat` (cmd)

### Permission denied
- Run terminal as Administrator for global installs
- Check antivirus isn't blocking node_modules
