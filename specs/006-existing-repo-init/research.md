# Research: Existing Repository Initialization

**Feature**: 006-existing-repo-init
**Date**: 2026-01-10

## Research Tasks

### 1. Package Manager Detection Patterns

**Decision**: Detect package manager by lock file presence in priority order

**Rationale**: Lock files are the definitive indicator of which package manager a project uses. Each PM uses a distinct lock file name.

**Detection Logic**:
| Lock File | Package Manager | Install Command | Add Command |
|-----------|----------------|-----------------|-------------|
| `yarn.lock` | yarn | `yarn install` | `yarn add` |
| `pnpm-lock.yaml` | pnpm | `pnpm install` | `pnpm add` |
| `bun.lockb` | bun | `bun install` | `bun add` |
| `package-lock.json` | npm | `npm install` | `npm install` |
| (none) | npm (default) | `npm install` | `npm install` |

**Alternatives Considered**:
- Check `packageManager` field in package.json - Rejected: Not all projects use this
- Use `which npm/yarn/pnpm` - Rejected: System availability ≠ project preference

### 2. File Conflict Resolution Strategies

**Decision**: Implement merge/skip/overwrite strategy per file type

**Rationale**: Different file types require different handling. Binary overwrites vs text merges.

| File | Strategy | Implementation |
|------|----------|----------------|
| `package.json` | **Merge** | Deep merge dependencies, preserve existing scripts |
| `.gitignore` | **Append** | Add AgentMark entries if not already present |
| `.env` | **Append** | Add new env vars, preserve existing |
| `agentmark.json` | **Prompt** | Ask user: skip or overwrite |
| `agentmark/` | **Prompt** | Ask user: skip examples, merge, or overwrite |
| `agentmark.client.ts` | **Prompt** | Ask user: skip or overwrite |
| `tsconfig.json` | **Skip** | Never modify existing tsconfig |
| `index.ts` | **Skip** | Never generate in existing projects |

**Alternatives Considered**:
- Always prompt for every file - Rejected: Too many prompts for common files
- Always overwrite - Rejected: Data loss risk
- Create backup files - Rejected: Adds complexity, .bak files are messy

### 3. Existing Project Detection

**Decision**: Detect by presence of configuration files

**TypeScript Project Indicators** (any of):
- `package.json` exists
- `tsconfig.json` exists
- `node_modules/` exists

**Python Project Indicators** (any of):
- `pyproject.toml` exists
- `requirements.txt` exists
- `setup.py` exists
- `.venv/` or `venv/` exists

**Rationale**: These files are universal markers of initialized projects in their respective ecosystems.

**Alternatives Considered**:
- Ask user "Is this an existing project?" - Rejected: Adds friction, can be auto-detected
- Check git history - Rejected: Not all projects use git

### 4. Script Naming Conflict Resolution

**Decision**: Use namespaced scripts when conflicts exist

**Logic**:
```
For each AgentMark script (dev, prompt, experiment, build):
  If script already exists in package.json:
    Use "agentmark:{script}" instead
  Else:
    Use original script name
```

**Example Output**:
```json
{
  "scripts": {
    "dev": "next dev",           // Existing - preserved
    "agentmark:dev": "agentmark dev",  // AgentMark - namespaced
    "prompt": "agentmark run-prompt",   // No conflict
    "experiment": "agentmark run-experiment"
  }
}
```

**Alternatives Considered**:
- Always use namespaced scripts - Rejected: Adds verbosity when not needed
- Prefix with "am:" - Rejected: Less readable than full namespace

### 5. Dependency Merge Strategy

**Decision**: Add AgentMark deps without touching existing deps

**Implementation**:
1. Read existing package.json
2. Add AgentMark dependencies to `dependencies` (only if not already present)
3. Add AgentMark devDependencies to `devDependencies` (only if not already present)
4. Preserve all existing dependencies at their current versions
5. Write merged package.json

**Key Rule**: Never upgrade or downgrade existing dependencies. Only add missing ones.

**Alternatives Considered**:
- Use `npm install --save` directly - Rejected: May update unrelated deps via semver
- Prompt for each new dependency - Rejected: Too many prompts

### 6. Python Virtual Environment Handling

**Decision**: Detect and reuse existing venv, never create new one

**Detection Order**:
1. `.venv/` (preferred)
2. `venv/`
3. Check `VIRTUAL_ENV` environment variable

**Behavior**:
- If venv exists: Use it for pip installs, show activation reminder
- If no venv: Warn user to create one, provide instructions

**Alternatives Considered**:
- Always create new .venv - Rejected: Would overwrite existing environment
- Auto-activate venv - Rejected: Not portable across shells

### 7. Current Directory Initialization

**Decision**: Accept "." as folder name to initialize in place

**Implementation**:
- When user enters "." or "./" as folder name:
  - Skip `mkdir` step
  - Use current directory for all file operations
  - Skip "cd" instruction in Next Steps output

**Alternatives Considered**:
- Require explicit `--cwd` flag - Rejected: Adds friction
- Default to current directory - Rejected: Breaking change for existing users

## Unresolved Items

None - all technical decisions resolved.

## Next Steps

Proceed to Phase 1: Generate data-model.md and quickstart.md
