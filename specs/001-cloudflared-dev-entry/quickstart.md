# Quickstart: Dev Entry Tracking & Cloudflared Tunneling

**Feature**: 001-cloudflared-dev-entry
**Date**: 2026-01-29

## Overview

This guide provides a quick reference for implementing the dev-entry relocation and cloudflared tunneling feature.

---

## Part 1: Dev Entry Relocation

### Files to Modify

1. **`packages/create-agentmark/src/utils/examples/create-example-app.ts`**
   - Change dev-entry.ts output location from `.agentmark/` to project root
   - Update gitignore entries to not ignore dev-entry.ts

2. **`packages/cli/cli-src/commands/dev.ts`**
   - Update file lookup to check project root first
   - Maintain backward compatibility with `.agentmark/` location

### Implementation Steps

```typescript
// In create-example-app.ts - Change this:
const agentmarkInternalDir = path.join(targetPath, '.agentmark');
fs.writeFileSync(path.join(agentmarkInternalDir, 'dev-entry.ts'), devEntryContent);

// To this:
fs.writeFileSync(path.join(targetPath, 'dev-entry.ts'), devEntryContent);
```

```typescript
// In dev.ts - Update file resolution:
const devEntryLocations = [
  path.join(cwd, 'dev-entry.ts'),           // New: project root
  path.join(cwd, '.agentmark', 'dev-entry.ts') // Legacy: backward compat
];

const devServerFile = devEntryLocations.find(loc => fs.existsSync(loc));
if (!devServerFile) {
  console.error('Error: No dev server entry point found.');
  process.exit(1);
}
```

### Gitignore Update

```typescript
// In create-example-app.ts - Change gitignore entries:
// Before:
const gitignoreEntries = ['node_modules/', '.env', '*.agentmark-outputs/', '.agentmark/', 'dist/'];

// After:
const gitignoreEntries = ['node_modules/', '.env', '*.agentmark-outputs/', 'dist/'];
// Note: .agentmark/ removed since dev-entry.ts is now at root
```

---

## Part 2: Cloudflared Tunneling

### New Files to Create

```text
packages/cli/cli-src/cloudflared/
├── index.ts        # Public exports
├── download.ts     # Binary download with consent
├── platform.ts     # Platform detection
└── tunnel.ts       # Tunnel creation and management
```

### Core Implementation

#### 1. Platform Detection (`platform.ts`)

```typescript
import os from 'os';
import path from 'path';

export interface PlatformInfo {
  os: NodeJS.Platform;
  arch: string;
  binaryName: string;
  isArchive: boolean;
}

const BINARY_MAP: Record<string, Record<string, { name: string; archive: boolean }>> = {
  win32: {
    x64: { name: 'cloudflared-windows-amd64.exe', archive: false },
    ia32: { name: 'cloudflared-windows-386.exe', archive: false }
  },
  darwin: {
    x64: { name: 'cloudflared-darwin-amd64.tgz', archive: true },
    arm64: { name: 'cloudflared-darwin-arm64.tgz', archive: true }
  },
  linux: {
    x64: { name: 'cloudflared-linux-amd64', archive: false },
    arm64: { name: 'cloudflared-linux-arm64', archive: false },
    arm: { name: 'cloudflared-linux-arm', archive: false }
  }
};

export function getPlatformInfo(): PlatformInfo {
  const platform = os.platform();
  const arch = os.arch();

  const info = BINARY_MAP[platform]?.[arch];
  if (!info) {
    throw new Error(`Unsupported platform: ${platform}/${arch}`);
  }

  return {
    os: platform,
    arch,
    binaryName: info.name,
    isArchive: info.archive
  };
}

export function getCacheDir(): string {
  return process.env.CLOUDFLARED_CACHE_DIR ||
    path.join(os.homedir(), '.cache', 'agentmark-cloudflared');
}

export function getBinaryPath(): string {
  const cacheDir = getCacheDir();
  const { binaryName, isArchive } = getPlatformInfo();
  const baseName = isArchive ? 'cloudflared' : binaryName;
  return path.join(cacheDir, baseName);
}
```

#### 2. Binary Download (`download.ts`)

```typescript
import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import prompts from 'prompts';
import { getPlatformInfo, getCacheDir, getBinaryPath } from './platform';

const GITHUB_RELEASE_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

export async function ensureCloudflared(): Promise<string> {
  const binaryPath = getBinaryPath();

  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  // Prompt for consent
  const { consent } = await prompts({
    type: 'confirm',
    name: 'consent',
    message: 'Cloudflared binary not found. Download it now? (~30MB)',
    initial: true
  });

  if (!consent) {
    throw new Error('Cloudflared binary required for tunnel. Use --tunnel to try again.');
  }

  await downloadBinary();
  return binaryPath;
}

async function downloadBinary(): Promise<void> {
  const { binaryName, isArchive } = getPlatformInfo();
  const cacheDir = getCacheDir();
  const downloadUrl = `${GITHUB_RELEASE_URL}/${binaryName}`;

  fs.mkdirSync(cacheDir, { recursive: true });

  console.log(`Downloading cloudflared from ${downloadUrl}...`);

  const tempPath = path.join(cacheDir, binaryName);
  await downloadFile(downloadUrl, tempPath);

  if (isArchive) {
    // Extract .tgz on macOS
    console.log('Extracting archive...');
    execSync(`tar -xzf "${tempPath}" -C "${cacheDir}"`);
    fs.unlinkSync(tempPath);
  }

  // Set executable permission on Unix
  const binaryPath = getBinaryPath();
  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log('Cloudflared installed successfully.');
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete partial file
      reject(err);
    });
  });
}
```

#### 3. Tunnel Management (`tunnel.ts`)

```typescript
import { spawn, ChildProcess } from 'child_process';
import { ensureCloudflared } from './download';

export interface TunnelInfo {
  url: string;
  provider: 'cloudflared';
  disconnect: () => Promise<void>;
}

export async function createTunnel(port: number): Promise<TunnelInfo> {
  const binaryPath = await ensureCloudflared();

  return new Promise((resolve, reject) => {
    const tunnel = spawn(binaryPath, ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let urlFound = false;
    const urlRegex = /https:\/\/([\w-]+)\.trycloudflare\.com/;

    const handleOutput = (data: Buffer) => {
      const output = data.toString();
      const match = output.match(urlRegex);

      if (match && !urlFound) {
        urlFound = true;
        resolve({
          url: match[0],
          provider: 'cloudflared',
          disconnect: async () => {
            tunnel.kill('SIGTERM');
            await new Promise<void>((res) => tunnel.on('close', res));
          }
        });
      }
    };

    tunnel.stdout.on('data', handleOutput);
    tunnel.stderr.on('data', handleOutput); // URL may appear in stderr

    tunnel.on('error', reject);
    tunnel.on('close', (code) => {
      if (!urlFound) {
        reject(new Error(`Cloudflared exited with code ${code} before establishing tunnel`));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!urlFound) {
        tunnel.kill();
        reject(new Error('Tunnel connection timeout'));
      }
    }, 30000);
  });
}
```

#### 4. Public Exports (`index.ts`)

```typescript
export { createTunnel, type TunnelInfo } from './tunnel';
export { ensureCloudflared } from './download';
export { getPlatformInfo, getCacheDir, getBinaryPath, type PlatformInfo } from './platform';
```

---

## Part 3: Integration

### Update `tunnel.ts`

Replace the existing localtunnel implementation:

```typescript
// packages/cli/cli-src/tunnel.ts
export { createTunnel, type TunnelInfo } from './cloudflared';
```

### Update `package.json`

Remove localtunnel dependency:

```diff
  "dependencies": {
-   "localtunnel": "^2.0.2",
    // ... other deps
  },
  "devDependencies": {
-   "@types/localtunnel": "^2.0.4",
    // ... other deps
  }
```

### Update `package-setup.ts`

Remove axios override (no longer needed):

```diff
- // Add overrides to fix vulnerabilities in transitive dependencies
- pkgJson.overrides = {
-   ...pkgJson.overrides,
-   "axios": "^1.7.9"
- };
```

---

## Testing Checklist

### Dev Entry Tests
- [ ] New project creates dev-entry.ts at root
- [ ] dev-entry.ts is not in .gitignore
- [ ] `agentmark dev` finds dev-entry.ts at root
- [ ] `agentmark dev` falls back to .agentmark/ for legacy projects
- [ ] Existing dev-entry.ts is not overwritten

### Cloudflared Tests
- [ ] Platform detection works on Windows/macOS/Linux
- [ ] Binary download prompts for consent
- [ ] Downloaded binary is executable
- [ ] Tunnel URL is captured correctly
- [ ] Tunnel disconnects cleanly on SIGTERM
- [ ] Retry logic works on connection failure
- [ ] Timeout triggers after 30 seconds

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLOUDFLARED_CACHE_DIR` | `~/.cache/agentmark-cloudflared` | Binary cache location |
| `CLOUDFLARED_VERSION` | `latest` | Pin specific version |
| `AGENTMARK_SKIP_CLOUDFLARED_DOWNLOAD` | `false` | Skip auto-download |
