# Quickstart: Nx Release with Version Plans

**Feature**: 004-nx-release
**Date**: 2026-01-08

## For Developers

### Creating a Version Plan (After Making Changes)

When you've made changes to a package, create a version plan before your PR:

```bash
# Interactive mode - guides you through package selection
yarn release:plan

# Or specify directly
nx release plan minor -m "Added new caching feature"
```

This creates a file in `.nx/version-plans/` that looks like:

```markdown
---
"@agentmark/sdk": minor
---

Added new caching feature to improve performance.
```

### Checking Your Version Plan

Before pushing, verify your version plan covers your changes:

```bash
yarn release:plan:check
```

If you see errors, create version plans for the missing packages.

### Preview a Release (Optional)

To see what a release would look like:

```bash
yarn release:dry-run
```

---

## For Maintainers

### Preparing a Release

1. Go to **Actions** → **Prepare Release** workflow
2. Click **Run workflow**
3. Leave dry_run unchecked (or check it to preview)
4. Click **Run workflow**

The workflow will:
- Apply all pending version plans
- Update package versions
- Generate changelogs
- Create a release PR

### Publishing a Release

Simply **merge the release PR** to main. The publish workflow automatically:
- Builds all packages
- Publishes to npm
- Creates git tags
- Creates GitHub releases

---

## Key Differences from Changeset

| Changeset | Nx Release |
|-----------|------------|
| `npx changeset` | `nx release plan` |
| `.changeset/*.md` | `.nx/version-plans/*.md` |
| `npx changeset version` | `nx release version` |
| `npx changeset publish` | `nx release publish` |
| Changeset bot checks PR | `nx release plan:check` in CI |

### What's Fixed

**Before (Changeset)**: When `@agentmark/sdk` got a minor bump, packages with it as a peer dependency automatically got a **major** bump.

**After (Nx Release)**: Each package version is controlled explicitly by version plan files. No automatic escalation.

---

## File Locations

```
.nx/
└── version-plans/        # Your version plan files go here
    ├── .gitkeep
    └── my-feature.md     # Example version plan

packages/
└── sdk/
    ├── package.json      # Version updated during release
    └── CHANGELOG.md      # Generated from version plan descriptions

CHANGELOG.md              # Workspace-level changelog
```

---

## Common Scenarios

### Multiple Package Changes

If your PR touches multiple packages:

```bash
# Option 1: Create one version plan with multiple packages
nx release plan

# Select multiple packages when prompted, or:
```

```markdown
---
"@agentmark/sdk": minor
"@agentmark/cli": patch
"@agentmark/loader-file": patch
---

SDK: Added new feature X
CLI: Fixed bug in command Y
Loader: Updated dependencies
```

### Pre-release Versions

For alpha/beta/rc releases:

**Step 1 - Developer**: Create version plan with prerelease bump type:
```markdown
---
"@agentmark/sdk": prerelease
"@agentmark/cli": preminor
---

Beta feature: Added experimental caching.
```

**Step 2 - Maintainer**: Trigger workflow with `preid` input:
1. Go to **Actions** → **Prepare Release**
2. Enter `preid`: `beta` (or `alpha`, `rc`)
3. Run workflow

This produces versions like: `1.0.0` → `1.0.1-beta.0` → `1.0.1-beta.1`

**Locally** (for testing):
```bash
nx release version --preid=beta --dry-run
```

### No Changes Need Releasing

If CI fails because you changed a package but don't need a release (e.g., test-only changes), the version plan check has ignore patterns configured for test files.

---

## Troubleshooting

### "Missing version plan for project X"

Run `nx release plan` and select the affected package(s).

### "Version plan file not consumed"

Ensure the package name in your version plan exactly matches the `name` field in that package's `package.json`.

### "npm publish failed"

Check that `NPM_TOKEN` secret is configured in repository settings with publish permissions.
