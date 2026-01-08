# Data Model: Replace Changeset with Nx Release

**Feature**: 004-nx-release
**Date**: 2026-01-08

## Overview

This feature involves configuration files and workflow definitions rather than traditional database entities. The "data model" consists of file structures, configuration schemas, and workflow state.

## Entities

### 1. Version Plan File

**Location**: `.nx/version-plans/*.md`

**Structure**:
```yaml
---
# YAML Front Matter - Package to bump type mapping
"@agentmark/sdk": minor
"@agentmark/cli": patch
"@agentmark/loader-file": patch
---

# Markdown Body - Changelog description
Description of changes that will appear in CHANGELOG.md files.

Supports multiple paragraphs and markdown formatting.
```

**Attributes**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Front Matter | YAML map | Yes | Package name → bump type (major/minor/patch) |
| Body | Markdown | Yes | Changelog entry text |

**Lifecycle**:
1. **Created**: Developer runs `nx release plan` or creates manually
2. **Accumulated**: Multiple version plan files can coexist across PRs
3. **Consumed**: `nx release version` reads and deletes files
4. **Archived**: Content becomes part of CHANGELOG.md entries

**Validation Rules**:
- Package names must match projects in `nx.json release.projects`
- Bump types must be: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease`
- At least one package must be specified
- Body text should be non-empty for meaningful changelogs

---

### 2. Nx Release Configuration

**Location**: `nx.json`

**Schema** (release section):
```json
{
  "release": {
    "versionPlans": true | { "ignorePatternsForPlanCheck": string[] },
    "projects": string[],
    "projectsRelationship": "independent" | "fixed",
    "changelog": {
      "projectChangelogs": {
        "file": string,
        "createRelease": "github" | false
      },
      "workspaceChangelog": {
        "file": string,
        "createRelease": "github" | false
      }
    },
    "version": {
      "generatorOptions": {
        "fallbackCurrentVersionResolver": "disk" | "registry"
      }
    },
    "releaseTagPattern": string,
    "git": {
      "commit": boolean,
      "tag": boolean,
      "commitMessage": string
    }
  }
}
```

**Key Configurations for This Feature**:
| Setting | Value | Purpose |
|---------|-------|---------|
| `versionPlans` | `true` | Enable file-based versioning |
| `projectsRelationship` | `"independent"` | Per-package versioning (no peer dep escalation) |
| `git.commit` | `false` | Workflow handles commits |
| `git.tag` | `false` | Workflow handles tags |

---

### 3. Package Release State

**Description**: Transient state during release workflow execution

**States**:
```
[Pending] → [Versioned] → [Published] → [Tagged] → [Released]
     ↓           ↓            ↓
  [Skipped]  [Failed]    [Failed]
```

**State Transitions**:
| From | To | Trigger | Side Effects |
|------|-----|---------|--------------|
| Pending | Versioned | `nx release version` | package.json updated, version plan deleted |
| Pending | Skipped | No version plan for package | None |
| Versioned | Published | `nx release publish` | Package on npm registry |
| Versioned | Failed | npm publish error | Error logged, continue to next |
| Published | Tagged | Git tag created | Tag in repository |
| Tagged | Released | GitHub release created | Release notes visible |

---

### 4. GitHub Workflow Configuration

**Location**: `.github/workflows/`

**Entities**:

#### release.yml (Prepare Release)
```yaml
inputs:
  dry_run:
    type: boolean
    default: false
    description: "Preview changes without committing"
```

#### release-publish.yml (Publish Release)
```yaml
triggers:
  - pull_request.closed (merged to main)
  - branch pattern: release/*
```

---

## Relationships

```
┌─────────────────────┐
│   nx.json           │
│   (Configuration)   │
└─────────┬───────────┘
          │ references
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│  packages/*/        │◄─────│  .nx/version-plans/ │
│  (Package Sources)  │      │  (Version Plans)    │
└─────────┬───────────┘      └─────────┬───────────┘
          │                            │
          │ version from               │ consumed by
          ▼                            ▼
┌─────────────────────┐      ┌─────────────────────┐
│  package.json       │◄─────│  nx release version │
│  CHANGELOG.md       │      │  (Workflow Step)    │
└─────────────────────┘      └─────────────────────┘
```

## File Conventions

| Pattern | Purpose |
|---------|---------|
| `.nx/version-plans/*.md` | Version plan files (any name, .md extension) |
| `.nx/version-plans/.gitkeep` | Ensure directory is tracked when empty |
| `packages/*/CHANGELOG.md` | Per-package changelog (generated) |
| `CHANGELOG.md` | Workspace changelog (generated) |
| `packages/*/package.json` | Package version source of truth |

## Validation Constraints

1. **Version Plan Check** (`nx release plan:check`):
   - All directly changed packages MUST have version plan entries
   - Patterns in `ignorePatternsForPlanCheck` are excluded from check

2. **Package Inclusion** (nx.json `release.projects`):
   - Only listed packages participate in release
   - Negation patterns (`!packages/foo`) exclude packages

3. **Bump Type Hierarchy**:
   - If multiple version plans specify different bumps for same package
   - Highest wins: `major` > `minor` > `patch`
