<!--
SYNC IMPACT REPORT
==================
Version Change: 1.0.0 → 1.1.0
Modified Principles:
  - III. Type Safety: Added Strict Typing Requirements subsection
  - IV. Testability: Added Test Coverage Requirements and Test Anti-patterns subsections
Added Sections:
  - Technology Standards > Security Standards (SQL/Database Query Safety, Input Validation)
  - Development Workflow > Code Review Requirements > Security Review Checklist
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

#### Strict Typing Requirements

- The `any` type MUST NOT be used except in type guards or legacy interop boundaries
- All public module exports MUST include explicit type exports for consumers
- Internal types used in public APIs MUST be exported alongside functions
- Type assertions (`as`) SHOULD be avoided; prefer type guards or schema validation

**Rationale**: Type safety catches errors early, enables IDE autocomplete, and ensures reliable
prompt execution at scale. Strict typing enables static analysis to catch bugs before runtime
and ensures consumers can properly type their code against library interfaces.

### IV. Testability

Every prompt and agent workflow MUST be independently testable:

- Datasets provide reproducible input/output pairs in JSONL format
- Evals assess quality through configurable evaluation criteria
- CLI supports running experiments directly for rapid iteration
- Test props enable local execution without external dependencies

#### Test Coverage Requirements

- Security-critical code paths (SQL queries, auth, input validation) MUST have explicit unit tests
- Edge cases for invalid inputs MUST be tested (NaN, negative numbers, empty strings, injection attempts)
- Integration tests MUST verify actual behavior, not just mock interactions
- Mock-heavy tests MUST be supplemented with at least one integration test per endpoint

#### Test Anti-patterns

- Tests MUST NOT only verify that mocks were called correctly without testing real behavior
- Cursor/pagination logic MUST be tested with round-trip serialization
- Query-building code MUST be tested with actual database queries, not just string assertions

**Rationale**: Testability enables confidence in prompt changes and supports continuous
integration workflows for AI applications. Mock-heavy tests create false confidence;
security and data-access code requires integration tests that verify actual behavior.

### V. Composability

Prompts and components MUST be composable and reusable:

- Components can be imported across multiple prompt files
- Filter functions enable data transformations within prompts
- Conditionals and loops provide dynamic content generation
- MCP servers extend functionality through standardized protocols

**Rationale**: Composability reduces duplication, encourages best practices, and enables teams
to build shared prompt libraries.

## Technology Standards

### Security Standards

#### SQL/Database Query Safety

- All database queries MUST use parameterized queries or prepared statements
- Direct string interpolation in SQL queries is FORBIDDEN, even for numeric values
- Values from user input, query parameters, or environment variables MUST be passed as parameters
- Query builders MUST validate inputs before construction (e.g., reject NaN, negative limits)

**Rationale**: SQL injection remains a top OWASP vulnerability. Even "safe" numeric
interpolation can produce invalid queries (NaN, Infinity) or enable attacks through
type coercion bugs.

#### Input Validation

- All external inputs (env vars, query params, API responses) MUST be validated before use
- Numeric parsing MUST include NaN/Infinity checks with explicit fallbacks
- Type coercion failures MUST default to safe values, not propagate invalid state

**Example**:
```typescript
// ❌ Unsafe
const timeout = parseInt(process.env.TIMEOUT_MS || '5000', 10);

// ✅ Safe
const parsed = parseInt(process.env.TIMEOUT_MS || '', 10);
const timeout = Number.isNaN(parsed) ? DEFAULT_TIMEOUT : parsed;
```

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

#### Security Review Checklist

- [ ] No direct string interpolation in SQL/shell commands
- [ ] All numeric inputs validated for NaN/Infinity
- [ ] All public types exported
- [ ] Edge case tests for invalid inputs
- [ ] At least one integration test for new endpoints

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

**Version**: 1.1.0 | **Ratified**: 2025-12-10 | **Last Amended**: 2026-01-09
