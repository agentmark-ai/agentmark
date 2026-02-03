# Data Model: Dev Entry Tracking & Cloudflared Tunneling

**Feature**: 001-cloudflared-dev-entry
**Date**: 2026-01-29

## Overview

This feature involves file system operations and process management rather than database entities. The data model defines TypeScript interfaces and configuration structures.

---

## 1. Core Interfaces

### TunnelInfo (Updated)

Extends existing interface to support cloudflared provider.

```typescript
export interface TunnelInfo {
  url: string;                    // Public tunnel URL (e.g., https://xyz.trycloudflare.com)
  provider: 'cloudflared';        // Changed from 'localtunnel'
  disconnect: () => Promise<void>; // Cleanup function
}
```

### CloudflaredConfig

Configuration for cloudflared binary management.

```typescript
export interface CloudflaredConfig {
  cacheDir: string;               // Binary cache directory
  version: string;                // Version to use ('latest' or specific)
  binaryPath: string | null;      // Resolved binary path (null if not downloaded)
}
```

### PlatformInfo

Platform detection for binary selection.

```typescript
export interface PlatformInfo {
  os: 'win32' | 'darwin' | 'linux';
  arch: 'x64' | 'arm64' | 'arm' | 'ia32';
  binaryName: string;             // Platform-specific binary filename
  isArchive: boolean;             // True for .tgz files (macOS)
}
```

### DownloadProgress

Progress reporting during binary download.

```typescript
export interface DownloadProgress {
  phase: 'checking' | 'downloading' | 'extracting' | 'ready';
  bytesDownloaded?: number;
  totalBytes?: number;
  message: string;
}
```

---

## 2. File System Entities

### Dev Entry File

| Attribute | Type | Description |
|-----------|------|-------------|
| Location | `./dev-entry.ts` | Project root (new) |
| Legacy Location | `./.agentmark/dev-entry.ts` | Backward compatibility |
| Content | TypeScript | Webhook server entry point |
| Tracked | Yes | Version controlled |

### Cloudflared Binary Cache

| Attribute | Value |
|-----------|-------|
| Default Location | `~/.cache/agentmark-cloudflared/` |
| Override | `CLOUDFLARED_CACHE_DIR` env var |
| Structure | `<version>/<binary>` |
| Permissions | `0o755` (Unix only) |

### Cache Directory Structure

```text
~/.cache/agentmark-cloudflared/
├── latest/                      # Symlink to current version
│   └── cloudflared              # Binary (or .exe on Windows)
└── 2024.1.5/                    # Specific version
    └── cloudflared
```

---

## 3. Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CLOUDFLARED_CACHE_DIR` | string | `~/.cache/agentmark-cloudflared` | Binary cache location |
| `CLOUDFLARED_VERSION` | string | `latest` | Specific version to use |
| `AGENTMARK_SKIP_CLOUDFLARED_DOWNLOAD` | boolean | `false` | Skip auto-download |

---

## 4. State Transitions

### Tunnel Lifecycle

```
┌─────────────┐
│   IDLE      │
└──────┬──────┘
       │ startTunnel()
       ▼
┌─────────────┐     binary missing     ┌─────────────┐
│  CHECKING   │ ───────────────────────▶│  PROMPTING  │
└──────┬──────┘                        └──────┬──────┘
       │ binary found                         │ user consents
       ▼                                      ▼
┌─────────────┐                        ┌─────────────┐
│  STARTING   │◀───────────────────────│ DOWNLOADING │
└──────┬──────┘                        └─────────────┘
       │ URL captured
       ▼
┌─────────────┐
│  CONNECTED  │
└──────┬──────┘
       │ disconnect() or SIGTERM
       ▼
┌─────────────┐
│ DISCONNECTED│
└─────────────┘
```

### Dev Entry File Resolution

```
┌────────────────────────────┐
│ Check ./dev-entry.ts       │
└─────────────┬──────────────┘
              │
       ┌──────┴──────┐
       │   exists?   │
       └──────┬──────┘
         yes  │  no
         ▼    ▼
    ┌────┐  ┌─────────────────────────┐
    │USE │  │Check ./.agentmark/      │
    └────┘  │      dev-entry.ts       │
            └──────────┬──────────────┘
                       │
                ┌──────┴──────┐
                │   exists?   │
                └──────┬──────┘
                  yes  │  no
                  ▼    ▼
             ┌────┐  ┌────────┐
             │USE │  │ ERROR  │
             └────┘  └────────┘
```

---

## 5. Validation Rules

### Binary Path Validation

```typescript
function validateBinaryPath(path: string): boolean {
  // Must exist
  if (!fs.existsSync(path)) return false;

  // Must be executable (Unix) or .exe (Windows)
  if (os.platform() !== 'win32') {
    const stats = fs.statSync(path);
    if (!(stats.mode & 0o111)) return false; // Not executable
  }

  return true;
}
```

### Dev Entry File Validation

```typescript
function validateDevEntry(path: string): boolean {
  // Must exist
  if (!fs.existsSync(path)) return false;

  // Must be TypeScript file
  if (!path.endsWith('.ts')) return false;

  // Must contain required imports (basic sanity check)
  const content = fs.readFileSync(path, 'utf-8');
  return content.includes('createWebhookServer');
}
```

---

## 6. Error States

| Error Code | Condition | User Message |
|------------|-----------|--------------|
| `BINARY_NOT_FOUND` | cloudflared not in cache and user declined download | "Cloudflared binary required. Run with --tunnel to download." |
| `DOWNLOAD_FAILED` | Network error during download | "Failed to download cloudflared. Check your network connection." |
| `UNSUPPORTED_PLATFORM` | OS/arch not supported | "Cloudflared is not available for your platform." |
| `TUNNEL_START_FAILED` | cloudflared process failed to start | "Failed to start tunnel. Check cloudflared installation." |
| `URL_PARSE_FAILED` | Could not extract URL from stdout | "Tunnel started but URL not detected. Check cloudflared logs." |
| `DEV_ENTRY_NOT_FOUND` | Neither location has dev-entry.ts | "No dev server entry point found. Run create-agentmark first." |

---

## 7. API Contracts

This feature does not introduce new HTTP APIs. It modifies CLI behavior and file generation.

### Contracts Directory

```text
specs/001-cloudflared-dev-entry/contracts/
└── (empty - no API contracts for this feature)
```

---

## 8. Migration Notes

### From localtunnel to cloudflared

| Aspect | Before | After |
|--------|--------|-------|
| Package | `localtunnel` npm package | cloudflared binary |
| Provider field | `'localtunnel'` | `'cloudflared'` |
| URL domain | `*.loca.lt` | `*.trycloudflare.com` |
| Dependencies | axios (vulnerable) | None (binary) |
| Subdomain support | Yes (unreliable) | No (random only) |

### From .agentmark/ to project root

| Aspect | Before | After |
|--------|--------|-------|
| File location | `.agentmark/dev-entry.ts` | `./dev-entry.ts` |
| Gitignored | Yes | No |
| Customizable | No (overwritten) | Yes (preserved) |
| Lookup order | Single location | Root first, then legacy |
