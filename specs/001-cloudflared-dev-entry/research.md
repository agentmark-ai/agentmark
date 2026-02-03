# Research: Dev Entry Tracking & Cloudflared Tunneling

**Feature**: 001-cloudflared-dev-entry
**Date**: 2026-01-29

## Overview

This document captures research findings for implementing cloudflared tunnel support and dev-entry file relocation in the AgentMark CLI.

---

## 1. Cloudflared Quick Tunnel API

### Decision
Use `cloudflared tunnel --url http://localhost:<PORT>` for free, account-less quick tunnels.

### Rationale
- Zero configuration required - single command creates tunnel
- No Cloudflare account needed for development use
- URL pattern is predictable (`https://<random>.trycloudflare.com`)
- Well-documented and widely used (Twilio, Beeper, etc.)
- Perfect fit for agentmark's development workflow

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| Managed Tunnels (require account/token) | Too complex for dev tunnels |
| Named Tunnels | Requires Cloudflare setup and persistence |
| ngrok | Different service, license considerations |
| localtunnel | Current solution - unreliable, vulnerable axios dependency |

### Implementation Notes
- Tunnel URL printed to stdout during connection
- Parse with regex: `/https:\/\/([\w-]+)\.trycloudflare\.com/`
- Use `--loglevel info` for cleaner output

---

## 2. Binary Download URLs

### Decision
Use GitHub Releases API as primary source for cloudflared binaries.

### Rationale
- Programmatic API access via `/repos/cloudflare/cloudflared/releases/latest`
- Direct download URLs available in response
- Reliable GitHub CDN delivery
- Version management through API
- No package manager dependencies

### Platform Binary Matrix

| Platform | Architecture | Binary Name |
|----------|-------------|-------------|
| Windows | x64 | `cloudflared-windows-amd64.exe` |
| Windows | x86 | `cloudflared-windows-386.exe` |
| macOS | Intel | `cloudflared-darwin-amd64.tgz` |
| macOS | ARM | `cloudflared-darwin-arm64.tgz` |
| Linux | x64 | `cloudflared-linux-amd64` |
| Linux | ARM64 | `cloudflared-linux-arm64` |
| Linux | ARM | `cloudflared-linux-arm` |

### Download URL Pattern
```
https://github.com/cloudflare/cloudflared/releases/latest/download/<binary-name>
```

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| Package managers (apt, brew) | Adds OS-level dependency |
| Official Cloudflare repo | Less API-friendly than GitHub |
| Bundling binary in npm | Bloats package, version management issues |

---

## 3. Binary Management Strategy

### Decision
Implement user-level cache directory strategy (similar to Playwright/Puppeteer).

### Rationale
- Follows industry best practices from major tools
- Downloads once per version, persists across projects
- Respects user home directory conventions
- Compatible with CI caching strategies
- Non-intrusive to project structure

### Cache Location
```typescript
const cacheDir = process.env.CLOUDFLARED_CACHE_DIR ||
  path.join(os.homedir(), '.cache', 'agentmark-cloudflared');
```

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `CLOUDFLARED_CACHE_DIR` | Custom cache location | `~/.cache/agentmark-cloudflared` |
| `CLOUDFLARED_VERSION` | Pin specific version | `latest` |

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| Project-local (`node_modules/.bin`) | Inflates node_modules, not portable |
| System PATH | Assumes global installation |
| Temporary directory | Redownloads every run |
| Use existing `cloudflared` npm package | Extra dependency, less control |

---

## 4. Process Management

### Decision
Use Node.js `spawn()` with stdout streaming and event-driven URL parsing.

### Rationale
- `spawn()` ideal for long-running processes
- Event-driven parsing enables immediate URL capture
- Standard signal handling matches Node.js conventions
- Minimal memory overhead vs buffered approaches

### Implementation Pattern
```typescript
const tunnel = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`]);

tunnel.stdout.on('data', (data) => {
  const output = data.toString();
  const urlMatch = output.match(/https:\/\/([\w-]+)\.trycloudflare\.com/);
  if (urlMatch) {
    resolve({ url: urlMatch[0], process: tunnel });
  }
});
```

### Graceful Shutdown
```typescript
process.on('SIGTERM', () => gracefulShutdown());
process.on('SIGINT', () => gracefulShutdown());

async function gracefulShutdown() {
  tunnel.kill('SIGTERM');
  setTimeout(() => process.exit(0), 5000); // Force exit after 5s
}
```

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| `exec()` | Shell overhead, security risk |
| `execFile()` | Buffered output unsuitable for streaming |
| External process manager | Adds complexity |

---

## 5. Existing npm Packages Analysis

### Decision
Implement custom thin wrapper rather than using existing packages.

### Rationale
- **Tighter integration** with agentmark CLI lifecycle
- **Reduced dependencies** - keeps agentmark lightweight
- **Full control** over logging, error handling, and user prompts
- **Consent prompt** requirement - existing packages don't support this
- **Version pinning** for reproducibility

### Packages Analyzed

| Package | Weekly Downloads | Approach | Why Not Use |
|---------|-----------------|----------|-------------|
| `cloudflared` | 23,873 | Auto-download, CLI wrapper | No consent prompt, extra dependency |
| `untun` | ~5,000 | Quick tunnel focused | Fork of above, same issues |
| `cloudflared-tunnel` | ~500 | Simple wrapper | Minimal maintenance |

### Custom Implementation Benefits
1. Consent prompt before download (FR-009)
2. Integrated with agentmark logging
3. Single-purpose: only quick tunnels needed
4. No unused features
5. Easier debugging and maintenance

---

## 6. Dev Entry File Location

### Decision
Place `dev-entry.ts` at project root alongside `agentmark.client.ts`.

### Rationale (from clarification session)
- Follows existing pattern of `agentmark.client.ts` at root
- Makes file immediately visible for customization
- Consistent with other config files (tsconfig.json, etc.)
- Clear separation from auto-generated internal files

### Migration Strategy
1. New projects: Generate at project root
2. Existing projects: Check both locations for backward compatibility
   - First: `./dev-entry.ts` (new location)
   - Fallback: `./.agentmark/dev-entry.ts` (legacy location)
3. Custom dev server: `./dev-server.ts` (already supported)

### Gitignore Changes
**Before:**
```
.agentmark/
```

**After:**
```
.agentmark/
!dev-entry.ts
```
Or simply don't gitignore since file is now at root.

---

## 7. Cross-Platform Considerations

### Platform Detection
```typescript
import os from 'os';

function getPlatformBinary(): string {
  const platform = os.platform(); // 'win32', 'darwin', 'linux'
  const arch = os.arch(); // 'x64', 'arm64', 'arm'

  const binaries: Record<string, Record<string, string>> = {
    win32: { x64: 'cloudflared-windows-amd64.exe', ia32: 'cloudflared-windows-386.exe' },
    darwin: { x64: 'cloudflared-darwin-amd64.tgz', arm64: 'cloudflared-darwin-arm64.tgz' },
    linux: { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64', arm: 'cloudflared-linux-arm' }
  };

  return binaries[platform]?.[arch] || throw new Error(`Unsupported platform: ${platform}/${arch}`);
}
```

### File Permissions
```typescript
// Platform-conditional chmod (no-op on Windows)
if (os.platform() !== 'win32') {
  fs.chmodSync(binaryPath, 0o755);
}
```

### Path Handling
- Use `path.join()` for all paths
- Handle `.tgz` extraction on macOS (tar archive)
- Windows binaries are direct executables

---

## Summary

| Area | Decision | Confidence |
|------|----------|------------|
| Tunnel API | `cloudflared tunnel --url` | Very High |
| Binary Source | GitHub Releases API | Very High |
| Cache Location | `~/.cache/agentmark-cloudflared/` | High |
| Version Management | `CLOUDFLARED_VERSION` env var | High |
| Process Spawning | `spawn()` with stdout parsing | Very High |
| Shutdown | SIGTERM + timeout | Very High |
| Implementation | Custom thin wrapper | High |
| Dev Entry Location | Project root | Confirmed |
