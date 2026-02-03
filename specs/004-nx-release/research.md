# Research: Replace Changeset with Nx Release

**Feature**: 004-nx-release
**Date**: 2026-01-08

## Research Tasks Completed

### 1. Nx Release Version Plans Configuration

**Decision**: Enable Version Plans via `versionPlans: true` in nx.json

**Configuration Required**:
```json
{
  "release": {
    "versionPlans": true,
    "projects": ["packages/*", "!packages/excluded-*"],
    "projectsRelationship": "independent"
  }
}
```

**Rationale**: Version Plans provide file-based versioning similar to Changeset's workflow. Files are stored in `.nx/version-plans/` with YAML front matter specifying packages and bump types.

**Alternatives considered**:
- Conventional Commits: Rejected - requires strict commit message discipline, less explicit control
- Interactive prompts at release time: Rejected - doesn't support per-PR change documentation

**Source**: [Nx Version Plans Documentation](https://nx.dev/docs/guides/nx-release/file-based-versioning-version-plans)

---

### 2. CI Validation with `nx release plan:check`

**Decision**: Add `nx release plan:check` to CI workflow on pull requests

**Implementation**:
```yaml
- name: Check version plans
  run: npx nx release plan:check --base=origin/main --head=HEAD
```

**Key Findings**:
- Command uses same options as `nx affected` for determining changed files
- Only checks directly changed projects (not transitively affected ones)
- Returns non-zero exit code when version plans are missing
- Use `--verbose` for detailed debugging output

**Configuration Option**:
```json
{
  "release": {
    "versionPlans": {
      "ignorePatternsForPlanCheck": ["**/*.spec.ts", "**/*.test.ts"]
    }
  }
}
```

**Known Issue**: GitHub issue #27739 reported exit code issues in some versions. Verify behavior with nx ^20.4.0.

**Rationale**: CI validation ensures developers create version plans for their changes before merge, maintaining changelog quality.

**Source**: [Nx File Based Versioning](https://nx.dev/docs/guides/nx-release/file-based-versioning-version-plans)

---

### 3. Release Workflow Pattern

**Decision**: Two-workflow approach (matching current setup)

**Workflow 1 - Prepare Release** (manual trigger):
```yaml
on:
  workflow_dispatch:
    inputs:
      dry_run:
        type: boolean
        default: false
```

Commands:
- `nx release version` - Apply version plans to package.json files
- `nx release changelog` - Generate changelogs from version plan descriptions
- Create PR with changes

**Workflow 2 - Publish Release** (on PR merge):
```yaml
on:
  pull_request:
    types: [closed]
    branches: [main]
```

Commands:
- `nx release publish` - Publish to npm
- Create git tags and GitHub releases

**Rationale**: Matches existing workflow structure and changeset's PR-based flow. Version plans are consumed (deleted) during version step.

**Source**: [Nx Publish in CI/CD](https://nx.dev/docs/guides/nx-release/publish-in-ci-cd)

---

### 4. Migration from Changeset

**Decision**: Clean removal of changeset, no migration of existing changesets

**Steps**:
1. Remove `@changesets/cli` dependency
2. Delete `.changeset/` directory
3. Remove changeset-related GitHub Actions (if any bot configured)
4. Enable version plans in nx.json
5. Create `.nx/version-plans/` directory (git-tracked)

**Rationale**: Per spec, migration of historical changesets is out of scope. Clean break is simpler than attempting to convert existing changeset files.

**Alternatives considered**:
- Convert existing changesets to version plans: Rejected - adds complexity, historical data preserved in git
- Keep both systems temporarily: Rejected - confusing for developers, duplicate tooling

---

### 5. Version Plan File Format

**Decision**: Use standard nx release plan format

**Example file** (`.nx/version-plans/my-feature.md`):
```markdown
---
"@agentmark/sdk": minor
"@agentmark/cli": patch
---

Added new feature X to SDK and fixed CLI bug Y.
```

**Key Points**:
- YAML front matter maps package names to bump types
- Markdown body becomes changelog entry
- Files are auto-deleted after `nx release version` consumes them
- Use `nx release plan` command for interactive creation

**Rationale**: Standard format ensures compatibility with nx release tooling and provides clear changelog entries.

---

### 6. Peer Dependency Handling

**Decision**: Nx Release does NOT auto-escalate peer dependency bumps (solving core problem)

**Verification**: Nx Release `projectsRelationship: "independent"` with Version Plans:
- Each package version is controlled explicitly by version plan files
- No automatic major bump when peer dependencies change
- Developers explicitly choose bump type per package

**Rationale**: This directly addresses the original changeset issue where peer dependency minor bumps caused automatic major bumps in dependent packages.

---

## Summary of Configuration Changes

### nx.json additions:
```json
{
  "release": {
    "versionPlans": true,
    "projects": ["packages/*", "!packages/eslint-config", ...],
    "projectsRelationship": "independent",
    "changelog": { ... },
    "version": {
      "generatorOptions": {
        "fallbackCurrentVersionResolver": "disk"
      }
    }
  }
}
```

### package.json script additions:
```json
{
  "scripts": {
    "release:plan": "nx release plan",
    "release:plan:check": "nx release plan:check"
  }
}
```

### New directories:
- `.nx/version-plans/` (with .gitkeep)

### Removed:
- `.changeset/` directory
- `@changesets/cli` dependency (if present)

## Sources

- [Nx Version Plans Documentation](https://nx.dev/docs/guides/nx-release/file-based-versioning-version-plans)
- [Nx Publish in CI/CD](https://nx.dev/docs/guides/nx-release/publish-in-ci-cd)
- [Nx Release Overview](https://nx.dev/docs/guides/nx-release)
- [GitHub Issue #27739 - plan:check exit codes](https://github.com/nrwl/nx/issues/27739)
