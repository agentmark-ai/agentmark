<!--
SYNC IMPACT REPORT
==================
Version Change: 1.3.0 → 1.3.1 (patch)
Modified Principles: None
Modified Sections:
  - Release Process: Updated from Changesets to Nx Release with Version Plans
Added Sections:
  - VI. Cross-Platform Compatibility (new core principle)
Removed Sections: N/A
Templates Requiring Updates: None
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

#### Test Value Requirements

Tests MUST provide actual value by testing real behavior:

- **Test outcomes, not implementation**: Verify what the code does, not how it does it
- **Test real logic**: URL construction, data transformation, error classification, cursor encoding
- **Avoid mock-only tests**: Tests that only verify "mock was called with X" are LOW VALUE
- **Mocking is acceptable when**: Testing logic that uses the mock (e.g., mock HTTP to test URL construction)

**Example - Low Value Test** (just verifies mock wiring):
```typescript
// ❌ Only checks that mock was called - catches no real bugs
it('should call dataSource', async () => {
  await handler({});
  expect(mockDataSource.listTraces).toHaveBeenCalled();
});
```

**Example - High Value Test** (tests real logic):
```typescript
// ✅ Tests actual error classification logic
it('should classify timeout errors as TIMEOUT', async () => {
  mockDataSource.listTraces.mockRejectedValue(new Error('Request timeout'));
  const result = await handler({});
  expect(JSON.parse(result.content[0].text).code).toBe('TIMEOUT');
});
```

#### Test Organization

Tests MUST be separated by type with clear directory structure:

```
test/
├── unit/           # Fast, isolated tests (no external dependencies)
│   ├── *.test.ts   # Test files for pure logic
│   └── ...
└── integration/    # Tests requiring external services
    ├── *.test.ts   # Test files requiring servers, databases, etc.
    └── ...
```

**Separation Rules**:
- **Unit tests** (`test/unit/`): Run with `npm test`, no servers or databases required
- **Integration tests** (`test/integration/`): Run with `npm run test:integration`, may require services
- Tests MUST NOT be placed in wrong directory (unit tests requiring servers, integration tests that don't)
- Each test file SHOULD contain only one type of test

**Package.json Convention**:
```json
{
  "scripts": {
    "test": "vitest run test/unit",
    "test:integration": "RUN_INTEGRATION_TESTS=true vitest run test/integration"
  }
}
```

#### Integration Test Requirements

- Integration tests MUST run in CI (not be silently skipped)
- CI MUST start required services before running integration tests
- Integration tests SHOULD fail fast with clear error messages when services unavailable
- Integration tests MUST NOT silently skip when dependencies missing (creates false confidence)

#### Test Coverage Requirements

- Security-critical code paths (SQL queries, auth, input validation) MUST have explicit unit tests
- Edge cases for invalid inputs MUST be tested (NaN, negative numbers, empty strings, injection attempts)
- Integration tests MUST verify actual behavior, not just mock interactions
- Mock-heavy tests MUST be supplemented with at least one integration test per endpoint

#### Test Anti-patterns

- Tests MUST NOT only verify that mocks were called correctly without testing real behavior
- Cursor/pagination logic MUST be tested with round-trip serialization
- Query-building code MUST be tested with actual database queries, not just string assertions
- Unit tests MUST NOT be placed in integration test directories (they won't run by default)
- Tests MUST NOT use `skipIf` for missing services without CI ensuring services exist

**Rationale**: Testability enables confidence in prompt changes and supports continuous
integration workflows for AI applications. Mock-heavy tests create false confidence;
security and data-access code requires integration tests that verify actual behavior.
Clear test separation ensures fast feedback during development while maintaining
comprehensive coverage in CI.

### V. Composability

Prompts and components MUST be composable and reusable:

- Components can be imported across multiple prompt files
- Filter functions enable data transformations within prompts
- Conditionals and loops provide dynamic content generation
- MCP servers extend functionality through standardized protocols

**Rationale**: Composability reduces duplication, encourages best practices, and enables teams
to build shared prompt libraries.

### VI. Cross-Platform Compatibility

All development workflows MUST work on Windows, macOS, and Linux:

- npm/yarn scripts MUST use cross-platform syntax (no Unix-only commands)
- Environment variables MUST be set using `cross-env` or equivalent
- File operations MUST use cross-platform tools (`shx`, Node.js fs, or platform-conditional logic)
- Path handling MUST work with both forward and backward slashes
- CI workflows MUST include Windows in the test matrix
- Shell scripts MAY require Git Bash on Windows if documented

#### Script Requirements

- `chmod` commands MUST be platform-conditional (no-op on Windows)
- `rm -rf` MUST use `shx rm -rf` or Node.js `fs.rmSync`
- Python venv paths MUST detect platform (`.venv/bin/` vs `.venv/Scripts/`)
- Inline environment variables (`VAR=value command`) MUST use `cross-env`

**Rationale**: Cross-platform compatibility ensures all contributors can participate regardless
of their operating system. Windows developers represent a significant portion of the community
and MUST NOT be blocked from contributing.

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
- Nx Release with Version Plans for coordinated multi-package releases
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

**Version**: 1.3.1 | **Ratified**: 2025-12-10 | **Last Amended**: 2026-01-15
