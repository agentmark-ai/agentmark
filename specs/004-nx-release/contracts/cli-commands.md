# CLI Command Contracts

**Feature**: 004-nx-release
**Date**: 2026-01-08

## Overview

This feature uses Nx Release CLI commands. No custom APIs are created - we leverage existing nx release commands.

## Commands

### 1. Create Version Plan

**Command**: `nx release plan`

**Usage**:
```bash
# Interactive mode (recommended)
nx release plan

# Direct specification
nx release plan minor -m "Added new feature"
nx release plan patch --projects=@agentmark/sdk -m "Bug fix"
```

**Options**:
| Flag | Type | Description |
|------|------|-------------|
| `<bump>` | string | Version bump type (major/minor/patch/etc) |
| `-m, --message` | string | Changelog description |
| `--projects` | string | Comma-separated project names |
| `-g, --group` | string | Release group name |
| `--dry-run` | boolean | Preview without creating file |

**Output**: Creates file in `.nx/version-plans/`

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid input, etc) |

---

### 2. Validate Version Plans

**Command**: `nx release plan:check`

**Usage**:
```bash
# Check against main branch
nx release plan:check --base=origin/main --head=HEAD

# Check uncommitted changes
nx release plan:check --uncommitted

# Verbose output
nx release plan:check --base=origin/main --head=HEAD --verbose
```

**Options**:
| Flag | Type | Description |
|------|------|-------------|
| `--base` | string | Base ref for comparison (e.g., origin/main) |
| `--head` | string | Head ref for comparison (e.g., HEAD) |
| `--uncommitted` | boolean | Include uncommitted changes |
| `--verbose` | boolean | Show detailed output |

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | All changed packages have version plans |
| 1 | Missing version plans for changed packages |

**CI Integration**:
```yaml
- name: Check version plans
  run: npx nx release plan:check --base=origin/main --head=HEAD
```

---

### 3. Apply Version Plans

**Command**: `nx release version`

**Usage**:
```bash
# Apply version plans
nx release version

# Dry run
nx release version --dry-run

# Skip publish (for PR workflow)
nx release version --skip-publish
```

**Behavior with Version Plans**:
- Reads all files from `.nx/version-plans/`
- Updates package.json versions accordingly
- Deletes consumed version plan files
- Updates internal dependency references

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error |

---

### 4. Generate Changelogs

**Command**: `nx release changelog`

**Usage**:
```bash
# Generate changelogs
nx release changelog

# Skip publish
nx release changelog --skip-publish

# Create GitHub releases
nx release changelog --create-release=github
```

**Output**:
- Updates `packages/*/CHANGELOG.md`
- Updates root `CHANGELOG.md`
- Optionally creates GitHub releases

---

### 5. Publish Packages

**Command**: `nx release publish`

**Usage**:
```bash
# Publish all releasable packages
nx release publish

# Dry run
nx release publish --dry-run
```

**Required Environment**:
```bash
NODE_AUTH_TOKEN=<npm-token>
NPM_CONFIG_PROVENANCE=true  # For provenance
```

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | All packages published |
| 1 | One or more packages failed (continues, reports at end) |

---

### 6. Full Release (Combined)

**Command**: `nx release`

**Usage**:
```bash
# Full release (version + changelog + publish)
nx release

# Dry run
nx release --dry-run

# Skip publish (for PR workflow)
nx release --skip-publish
```

---

## npm Scripts

**Added to package.json**:
```json
{
  "scripts": {
    "release:plan": "nx release plan",
    "release:plan:check": "nx release plan:check --base=origin/main --head=HEAD",
    "release:version": "nx release version",
    "release:changelog": "nx release changelog",
    "release:publish": "nx release publish",
    "release:dry-run": "nx release --dry-run"
  }
}
```

## Workflow Triggers

### GitHub Workflow Dispatch (release.yml)

**Inputs**:
```yaml
inputs:
  dry_run:
    description: 'Dry run (no actual changes)'
    required: false
    type: boolean
    default: false
```

### GitHub PR Trigger (release-publish.yml)

**Conditions**:
```yaml
if: >
  github.event.pull_request.merged == true &&
  startsWith(github.event.pull_request.head.ref, 'release/')
```
