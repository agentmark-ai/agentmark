# Quickstart: Existing Repository Initialization

**Feature**: 006-existing-repo-init
**Date**: 2026-01-10

## Overview

This guide explains how to add AgentMark to an existing TypeScript or Python project.

## Prerequisites

- Node.js 18 or higher
- An existing project with:
  - TypeScript: `package.json` and source files
  - Python: `pyproject.toml` or `requirements.txt` and source files

## Usage

### Adding AgentMark to Existing TypeScript Project

```bash
# Navigate to your project root
cd my-existing-app

# Run create-agentmark and choose "." for current directory
npx create-agentmark
```

When prompted:
1. **Folder name**: Enter `.` to initialize in current directory
2. **Language**: Select TypeScript
3. **API Key**: Enter your OpenAI key (or skip)
4. **Adapter**: Choose AI SDK or Mastra
5. **Deployment**: Choose Cloud or Self-hosted
6. **IDE**: Select your IDE for MCP setup

The tool will:
- Detect your existing `package.json` and preserve it
- Add AgentMark dependencies without touching your existing deps
- Add AgentMark scripts (namespaced if conflicts exist)
- Append to your `.gitignore` and `.env`
- Create `agentmark/` directory with example prompts
- Create `agentmark.client.ts` configuration

### Adding AgentMark to Existing Python Project

```bash
# Navigate to your project root
cd my-existing-python-app

# Run create-agentmark with --python flag
npx create-agentmark --python
```

When prompted:
1. **Folder name**: Enter `.` to initialize in current directory
2. **API Key**: Enter your OpenAI key (or skip)
3. **Deployment**: Choose Cloud or Self-hosted
4. **IDE**: Select your IDE for MCP setup

The tool will:
- Detect your existing `pyproject.toml` and preserve it
- Detect your existing virtual environment
- Create `agentmark/` directory with example prompts
- Create `agentmark_client.py` configuration
- Append to your `.gitignore` and `.env`

## Conflict Handling

If AgentMark files already exist, you'll be prompted:

```
? agentmark.json already exists. What would you like to do?
  > Skip (keep existing)
    Overwrite
```

### Files That Are Merged
- `package.json` - AgentMark deps added, existing deps preserved
- `.gitignore` - AgentMark entries appended
- `.env` - AgentMark vars appended

### Files That Prompt
- `agentmark.json` - Skip or overwrite
- `agentmark/` directory - Skip examples or create
- `agentmark.client.ts` - Skip or overwrite

### Files Never Modified
- `tsconfig.json` - Never touched
- `index.ts` - Never generated in existing projects
- `pyproject.toml` - Never modified
- `main.py` - Never generated in existing projects

## Package Manager Support

The tool automatically detects your package manager:

| If you have... | AgentMark uses... |
|----------------|-------------------|
| `yarn.lock` | `yarn add` |
| `pnpm-lock.yaml` | `pnpm add` |
| `bun.lockb` | `bun add` |
| `package-lock.json` | `npm install` |
| None | `npm install` (default) |

## Running AgentMark

After initialization:

```bash
# If you have an existing "dev" script, use:
npm run agentmark:dev

# If no conflict, use:
npm run dev
```

## Example: Next.js Project

```bash
# Existing Next.js project structure
my-nextjs-app/
├── package.json
├── tsconfig.json
├── next.config.js
├── pages/
│   └── index.tsx
└── .gitignore

# After running `npx create-agentmark` with "."
my-nextjs-app/
├── package.json          # Modified: AgentMark deps added
├── tsconfig.json         # Unchanged
├── next.config.js        # Unchanged
├── pages/
│   └── index.tsx         # Unchanged
├── agentmark/            # NEW
│   ├── party-planner.prompt.mdx
│   └── party-planner.jsonl
├── agentmark.json        # NEW
├── agentmark.client.ts   # NEW
├── .agentmark/           # NEW
│   └── dev-entry.ts
├── .gitignore            # Modified: AgentMark entries added
└── .env                  # Modified: OPENAI_API_KEY added
```

## Troubleshooting

### "Permission denied" error
Ensure you have write access to the project directory.

### Existing scripts conflict
If your project already has `dev`, `build`, etc., AgentMark uses `agentmark:dev`, `agentmark:build` instead.

### Python venv not detected
If you have a non-standard venv location, create `.venv/` in your project root before running.
