<!--
SYNC IMPACT REPORT
==================
Version Change: N/A → 1.0.0 (initial ratification)
Modified Principles: N/A (new constitution)
Added Sections:
  - Core Principles (5 principles)
  - Technology Standards
  - Development Workflow
  - Governance
Removed Sections: N/A
Templates Requiring Updates:
  - .specify/templates/plan-template.md: ✅ compatible (Constitution Check section exists)
  - .specify/templates/spec-template.md: ✅ compatible (requirements/success criteria aligned)
  - .specify/templates/tasks-template.md: ✅ compatible (phase structure aligned)
Follow-up TODOs: None
-->

# AgentMark Constitution

## Core Principles

### I. Markdown-First Design

All prompt definitions, configurations, and agent workflows MUST be expressed in human-readable
Markdown (MDX) format. This principle ensures:

- Prompts are version-controllable alongside application code
- Non-technical team members can review and contribute to prompt engineering
- Prompt content remains portable across different runtime environments
- Clear separation between prompt logic and execution infrastructure

**Rationale**: Markdown-first design democratizes AI development by making prompts accessible to
all stakeholders while maintaining developer-friendly tooling.

### II. Adapter Neutrality

AgentMark MUST NOT directly integrate with any LLM provider or SDK. Instead:

- All provider integration MUST occur through adapter interfaces
- Adapters transform AgentMark output to provider-specific formats
- New adapters can be added without modifying core functionality
- Users choose their preferred SDK (Vercel AI, Mastra, LlamaIndex, etc.)

**Rationale**: Adapter neutrality prevents vendor lock-in and allows the community to extend
support to new providers without core changes.

### III. Type Safety

All inputs and outputs MUST be type-safe and schema-validated:

- JSON Schema definitions MUST accompany structured outputs
- TypeScript types MUST be auto-generated from schemas where applicable
- Runtime validation MUST catch schema violations before LLM invocation
- Props passed to prompts MUST match declared input schemas

**Rationale**: Type safety catches errors early, enables IDE autocomplete, and ensures reliable
prompt execution at scale.

### IV. Testability

Every prompt and agent workflow MUST be independently testable:

- Datasets provide reproducible input/output pairs in JSONL format
- Evals assess quality through configurable evaluation criteria
- CLI supports running experiments directly for rapid iteration
- Test props enable local execution without external dependencies

**Rationale**: Testability enables confidence in prompt changes and supports continuous
integration workflows for AI applications.

### V. Composability

Prompts and components MUST be composable and reusable:

- Components can be imported across multiple prompt files
- Filter functions enable data transformations within prompts
- Conditionals and loops provide dynamic content generation
- MCP servers extend functionality through standardized protocols

**Rationale**: Composability reduces duplication, encourages best practices, and enables teams
to build shared prompt libraries.

## Technology Standards

### Language Support

- TypeScript/JavaScript: Primary supported languages
- Python: Planned support (in development)
- Additional languages: Community-driven via GitHub issues

### File Conventions

- Prompt files: `*.prompt.mdx`
- Dataset files: `*.jsonl`
- Configuration: `agentmark.config.{ts,js}`
- Generated types: Co-located with prompt files or in dedicated `types/` directory

### Dependency Management

- Core packages MUST minimize external dependencies
- Adapter packages MAY depend on their target SDK
- Peer dependencies MUST be clearly documented
- Breaking changes in dependencies require MAJOR version bumps

## Development Workflow

### Code Review Requirements

- All changes MUST pass automated linting and type checking
- Prompt changes SHOULD include updated test datasets
- Breaking changes MUST include migration documentation
- New features MUST include documentation updates

### Testing Gates

- Unit tests for core parsing and transformation logic
- Integration tests for adapter transformations
- End-to-end tests for CLI commands
- Manual verification for UI/UX changes (if applicable)

### Release Process

- Semantic versioning (MAJOR.MINOR.PATCH) for all packages
- Changesets for coordinated multi-package releases
- Pre-release versions for testing breaking changes
- Release notes MUST document all user-facing changes

## Governance

This constitution supersedes conflicting practices in feature specifications and implementation
plans. Amendments follow this process:

1. **Proposal**: Open a GitHub issue describing the change and rationale
2. **Discussion**: Allow community input for at least 7 days
3. **Approval**: Maintainer consensus required for adoption
4. **Migration**: Document upgrade path for breaking governance changes

### Compliance Verification

- PRs MUST reference applicable constitution principles when relevant
- Complexity beyond standard patterns MUST be justified in PR description
- Constitution violations block merge until resolved or exception granted

### Version Policy

- MAJOR: Principle removal or incompatible redefinition
- MINOR: New principle or significant guidance expansion
- PATCH: Clarifications, typos, non-semantic refinements

**Version**: 1.0.0 | **Ratified**: 2025-12-10 | **Last Amended**: 2025-12-10
