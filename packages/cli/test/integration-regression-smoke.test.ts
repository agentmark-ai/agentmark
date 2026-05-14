/**
 * End-to-end smoke for the regression-gate slice (PR #2289):
 *
 * Hits the real templatedx parser → real `readTestSettings` → real
 * JUnit formatter. Confirms that:
 *
 * 1. `readTestSettings` correctly extracts `regression_tolerance` from
 *    an AST produced by the production parser (not just hand-crafted
 *    fixtures).
 * 2. The value flows through to the JUnit XML output as a `<property>`.
 * 3. With a baselineScore supplied, the gate predicate fires and emits
 *    a `<failure>` — the only existing escape hatch for code-path users
 *    until the baseline endpoint ships.
 *
 * This catches the kind of integration drift the unit tests can miss —
 * e.g. if the templatedx AST shape ever changes so the yaml node isn't
 * at `ast.children[0]`, or if the new TestSettingsSchema export breaks.
 */

import { describe, it, expect } from "vitest";
import { getTemplateDXInstance } from "@agentmark-ai/prompt-core";
import { readTestSettings } from "../cli-src/utils/test-settings";
import { buildJUnitXml, type JUnitRow } from "../cli-src/utils/junit-formatter";

const PROMPT_WITH_TOLERANCE = `---
name: smoke-test
text_config:
  model_name: openai/gpt-4o
test_settings:
  dataset: ./data.jsonl
  regression_tolerance: 0.05
---

Hello {props.name}!
`;

const PROMPT_WITHOUT_TOLERANCE = `---
name: no-tolerance
text_config:
  model_name: openai/gpt-4o
test_settings:
  dataset: ./data.jsonl
---

Hello {props.name}!
`;

const PROMPT_WITH_INVALID_TOLERANCE = `---
name: bad-tolerance
text_config:
  model_name: openai/gpt-4o
test_settings:
  dataset: ./data.jsonl
  regression_tolerance: 5
---

Hello {props.name}!
`;

async function parseRealAst(content: string) {
  const templateDX = getTemplateDXInstance("language");
  return templateDX.parse(content, "/tmp", async () => "");
}

describe("regression-gate end-to-end (PR #2289)", () => {
  it("extracts regression_tolerance from a real templatedx-parsed AST", async () => {
    const ast = await parseRealAst(PROMPT_WITH_TOLERANCE);
    const settings = await readTestSettings(ast);
    expect(settings?.regression_tolerance).toBe(0.05);
    expect(settings?.dataset).toBe("./data.jsonl");
  });

  it("returns undefined when test_settings has no regression_tolerance", async () => {
    const ast = await parseRealAst(PROMPT_WITHOUT_TOLERANCE);
    const settings = await readTestSettings(ast);
    expect(settings?.regression_tolerance).toBeUndefined();
    expect(settings?.dataset).toBe("./data.jsonl");
  });

  it("silently rejects an out-of-range regression_tolerance (no throw)", async () => {
    const ast = await parseRealAst(PROMPT_WITH_INVALID_TOLERANCE);
    const settings = await readTestSettings(ast);
    // Whole `test_settings` is undefined because Zod rejected the block —
    // safer than partial extraction, and the typo doesn't silently change
    // gate behaviour.
    expect(settings).toBeUndefined();
  });

  it("threads regression_tolerance through to the JUnit XML output", async () => {
    const ast = await parseRealAst(PROMPT_WITH_TOLERANCE);
    const settings = await readTestSettings(ast);

    const rows: JUnitRow[] = [
      {
        index: 1,
        input: "x",
        actualOutput: "y",
        expectedOutput: "z",
        evals: [{ name: "groundedness", score: 0.9, passed: true }],
      },
    ];

    const xml = buildJUnitXml(rows, {
      suiteName: "smoke",
      regressionTolerance: settings?.regression_tolerance,
    });

    // The tolerance is in <properties>, so JUnit consumers that surface
    // custom properties can show it. Format: fraction (0.05), matching
    // how the schema validates.
    expect(xml).toContain('<property name="regression_tolerance" value="0.05"/>');
  });

  it("fires the regression gate end-to-end when baseline is supplied", async () => {
    const ast = await parseRealAst(PROMPT_WITH_TOLERANCE);
    const settings = await readTestSettings(ast);

    // Score dropped 7.7% (0.91 → 0.84). Tolerance is 5%. Should fire.
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: "x",
        actualOutput: "y",
        expectedOutput: "z",
        evals: [
          { name: "groundedness", score: 0.84, passed: true, baselineScore: 0.91 },
        ],
      },
    ];

    const xml = buildJUnitXml(rows, {
      suiteName: "smoke",
      regressionTolerance: settings?.regression_tolerance,
    });

    expect(xml).toMatch(/failures="1"/);
    expect(xml).toMatch(/<failure message="groundedness regressed 7\.7% vs baseline/);
    expect(xml).toContain('<property name="baseline_score" value="0.91"/>');
  });

  it("does NOT fire the regression gate when score drop is within tolerance", async () => {
    const ast = await parseRealAst(PROMPT_WITH_TOLERANCE);
    const settings = await readTestSettings(ast);

    // 2.2% drop, within 5% tolerance.
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: "x",
        actualOutput: "y",
        expectedOutput: "z",
        evals: [
          { name: "groundedness", score: 0.89, passed: true, baselineScore: 0.91 },
        ],
      },
    ];

    const xml = buildJUnitXml(rows, {
      suiteName: "smoke",
      regressionTolerance: settings?.regression_tolerance,
    });

    expect(xml).toMatch(/failures="0"/);
    expect(xml).not.toContain("<failure");
  });
});
