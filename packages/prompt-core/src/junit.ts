/**
 * JUnit XML formatter for AgentMark eval results.
 *
 * Emits a JUnit XML document compatible with the de-facto schema documented
 * at https://github.com/testmoapp/junitxml and consumed by GitHub Actions
 * parsers like `mikepenz/action-junit-report` and `EnricoMi/publish-test-results`.
 *
 * Each `(dataset row × scorer)` pair becomes one `<testcase>`. Per-case score
 * and scorer metadata travels via `<property>` elements inside `<properties>`,
 * which the popular parsers surface verbatim. Failing scorers emit a
 * `<failure>` element with the input/actual/expected payload in CDATA.
 */

import { isRegression, type ScoreThresholdResult } from "./gate";

const LABEL_WIDTH = 11;

export interface JUnitEval {
  name: string;
  score?: number;
  passed?: boolean;
  label?: string;
  reason?: string;
  /**
   * Score for this `(row × scorer)` pair on the configured baseline run,
   * when known. The regression gate fires when `score < baselineScore -
   * regressionTolerance`. Absent for first-run / no-baseline cases.
   */
  baselineScore?: number;
}

export interface JUnitRow {
  index: number;
  rowId?: string;
  input: unknown;
  actualOutput: unknown;
  expectedOutput: unknown;
  evals: JUnitEval[];
  durationSec?: number;
}

export interface JUnitSuiteOptions {
  suiteName: string;
  commitSha?: string;
  promptPath?: string;
  runId?: string;
  /**
   * Fractional drop (0–1) below the baseline score that fails the regression
   * gate. Only applied when an eval has a `baselineScore`. Suite-level —
   * applies to every scorer that has a baseline. Reads from the prompt's
   * `test_settings.regression_tolerance` frontmatter field at the call site.
   */
  regressionTolerance?: number;
  /** Commit SHA used as the baseline for this run, if any. Recorded in `<properties>` for downstream tooling. */
  baselineCommitSha?: string;
  /**
   * ISO 8601 timestamp for the suite. Defaults to `new Date().toISOString()` at
   * call time. Override in tests for deterministic output.
   */
  timestamp?: string;
  /**
   * Run-level per-scorer threshold outcomes (from `test_settings.score_thresholds`).
   * Each entry becomes one additional `<testcase name="run-threshold">`, failing
   * when the scorer's mean score across the run dropped below its threshold.
   * These count toward the suite's `tests`/`failures` totals.
   */
  scoreThresholds?: ScoreThresholdResult[];
}

// isRegression + ScoreThresholdResult come from ./gate (imported above). The
// package barrel (index.ts) re-exports them for external consumers, so this
// module does not need to.

/**
 * Escape a string for use as an XML attribute value.
 *
 * Replaces the five predefined entity characters and strips invalid XML 1.0
 * control characters (everything below 0x20 except tab/LF/CR, plus the
 * DEL/C1 range that some parsers reject).
 */
export function escapeXmlAttribute(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape a string for use as XML text content (between tags).
 *
 * Less aggressive than attribute escaping — quotes and apostrophes are legal
 * in element content — but still strips invalid control characters.
 */
export function escapeXmlText(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Wrap arbitrary text in a CDATA section. If the input contains the CDATA
 * terminator `]]>`, it is split across two CDATA sections so the document
 * stays well-formed (the canonical workaround).
 */
export function wrapCdata(value: string): string {
  const sanitized = stripInvalidXmlChars(value);
  if (sanitized.length === 0) return '<![CDATA[]]>';
  const safe = sanitized.split(']]>').join(']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

/**
 * Strip characters that are not allowed in an XML 1.0 document.
 *
 * Valid range per the XML 1.0 spec: #x9 | #xA | #xD | [#x20-#xD7FF] |
 * [#xE000-#xFFFD] | [#x10000-#x10FFFF].
 */
function stripInvalidXmlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]/g, '');
}

/**
 * Stringify an unknown value for embedding in XML. Strings pass through;
 * everything else is JSON-stringified. `undefined` and `null` map to empty
 * string so we never emit the literal string "undefined" or "null".
 */
export function stringifyForXml(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Build a JUnit XML document for a single eval suite.
 *
 * The suite name is typically the prompt path. Counts and per-case timing
 * are computed from `rows`. The output begins with the XML declaration so
 * the result is a standalone document writable to `results.xml` and
 * consumable by any JUnit parser.
 */
export function buildJUnitXml(rows: JUnitRow[], options: JUnitSuiteOptions): string {
  return buildJUnitReport(rows, options).xml;
}

export interface JUnitReport {
  xml: string;
  /** Total `<testcase>` count (per-row pairs + run-level threshold cases). */
  tests: number;
  /** Number of failing testcases (any predicate) — surfaced in the XML for consumers like mikepenz. */
  failures: number;
  /**
   * Subset of failures caused specifically by the regression-vs-baseline gate.
   * Tracked separately because absolute per-row failures are reported in the
   * XML but historically don't fail the CLI's own exit code (the consumer gates
   * on them); the regression gate is new and *does* fail the process.
   */
  regressionFailures: number;
}

/**
 * Build the JUnit document plus its failure tally in one pass, so callers can
 * set a process exit code without re-parsing the XML they just emitted.
 */
export function buildJUnitReport(rows: JUnitRow[], options: JUnitSuiteOptions): JUnitReport {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const testcases = [
    ...rows.flatMap((row) => buildTestcases(row, options)),
    ...buildRunLevelThresholdTestcases(options),
  ];

  const totalTests = testcases.length;
  const totalFailures = testcases.filter((tc) => tc.failed).length;
  const regressionFailures = testcases.filter((tc) => tc.regressionFailed).length;
  const totalTime = rows.reduce((sum, r) => sum + (r.durationSec ?? 0), 0);

  const suiteAttrs = [
    `name="${escapeXmlAttribute(options.suiteName)}"`,
    `tests="${totalTests}"`,
    `failures="${totalFailures}"`,
    `errors="0"`,
    `skipped="0"`,
    `time="${totalTime.toFixed(3)}"`,
    `timestamp="${escapeXmlAttribute(timestamp)}"`,
  ];

  const suitesAttrs = [
    `name="${escapeXmlAttribute(options.suiteName)}"`,
    `tests="${totalTests}"`,
    `failures="${totalFailures}"`,
    `time="${totalTime.toFixed(3)}"`,
  ];

  // Note: we intentionally emit unindented testcase XML. Indenting would
  // bleed leading whitespace into CDATA payloads, which JUnit parsers render
  // verbatim — the result would look mis-aligned in PR comments.
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites ${suitesAttrs.join(' ')}>`,
    `<testsuite ${suiteAttrs.join(' ')}>`,
    ...testcases.map((tc) => tc.xml),
    `</testsuite>`,
    `</testsuites>`,
    '',
  ].join('\n');

  return { xml: body, tests: totalTests, failures: totalFailures, regressionFailures };
}

interface BuiltTestcase {
  xml: string;
  failed: boolean;
  /** True when the failure was specifically the regression-vs-baseline gate. */
  regressionFailed?: boolean;
}

function buildTestcases(row: JUnitRow, options: JUnitSuiteOptions): BuiltTestcase[] {
  if (row.evals.length === 0) {
    // No scorers ran on this row — emit a single passing testcase to keep
    // row visibility in the test report.
    return [buildTestcase(row, null, options)];
  }
  return row.evals.map((evalResult) => buildTestcase(row, evalResult, options));
}

/**
 * One `<testcase>` per configured `score_thresholds` entry, asserting the
 * scorer's mean score across the run met its minimum. Run-level (not tied to
 * any single row), so they sit alongside the per-row cases in the same suite.
 */
function buildRunLevelThresholdTestcases(options: JUnitSuiteOptions): BuiltTestcase[] {
  const results = options.scoreThresholds ?? [];
  return results.map((r) => {
    const failed = r.mean < r.threshold;
    const propertyLines = [
      propertyLine("scorer", r.scorer),
      propertyLine("mean_score", String(r.mean)),
      propertyLine("threshold", String(r.threshold)),
      propertyLine("sample_count", String(r.count)),
    ];
    if (options.commitSha) propertyLines.push(propertyLine("commit_sha", options.commitSha));

    const innerLines: string[] = [
      `  <properties>`,
      ...propertyLines.map((p) => `    ${p}`),
      `  </properties>`,
    ];
    if (failed) {
      const message = `${r.scorer} mean ${r.mean.toFixed(3)} below threshold ${r.threshold}`;
      innerLines.push(
        `  <failure message="${escapeXmlAttribute(message)}" type="ThresholdFailure">`,
        `    ${wrapCdata(`mean=${r.mean} threshold=${r.threshold} n=${r.count}`)}`,
        `  </failure>`,
      );
    }

    const attrs = [
      `classname="${escapeXmlAttribute(r.scorer)}"`,
      `name="run-threshold"`,
      `time="0.000"`,
    ];
    const xml = [
      `<testcase ${attrs.join(" ")}>`,
      ...innerLines,
      `</testcase>`,
    ].join("\n");
    return { xml, failed };
  });
}

function buildTestcase(
  row: JUnitRow,
  evalResult: JUnitEval | null,
  options: JUnitSuiteOptions
): BuiltTestcase {
  const scorerName = evalResult?.name ?? 'no-eval';
  const rowName = row.rowId ?? `row-${row.index}`;
  const time = (row.durationSec ?? 0).toFixed(3);

  // Two gate predicates, combined with OR — either failing fails the case.
  //   absolute:    `passed === false` from the scorer itself
  //   regression:  score dropped more than `regressionTolerance` below the
  //                baseline. Skipped when no baseline is available, so first
  //                runs and never-seen-before scorers don't false-fail.
  const failedAbsolute = evalResult?.passed === false;
  const regressionDelta = computeRegressionDelta(evalResult);
  const tolerance = options.regressionTolerance;
  const failedRegression = isRegression(evalResult?.score, evalResult?.baselineScore, tolerance);
  const failed = failedAbsolute || failedRegression;

  const propertyLines: string[] = [];
  if (evalResult) {
    propertyLines.push(propertyLine('scorer', evalResult.name));
    if (typeof evalResult.score === 'number') {
      propertyLines.push(propertyLine('score', String(evalResult.score)));
    }
    if (typeof evalResult.baselineScore === 'number') {
      propertyLines.push(propertyLine('baseline_score', String(evalResult.baselineScore)));
    }
    if (typeof evalResult.passed === 'boolean') {
      propertyLines.push(propertyLine('passed', String(evalResult.passed)));
    }
    if (evalResult.label) {
      propertyLines.push(propertyLine('label', evalResult.label));
    }
  }
  if (typeof options.regressionTolerance === 'number') {
    propertyLines.push(propertyLine('regression_tolerance', String(options.regressionTolerance)));
  }
  if (options.commitSha) {
    propertyLines.push(propertyLine('commit_sha', options.commitSha));
  }
  if (options.baselineCommitSha) {
    propertyLines.push(propertyLine('baseline_commit_sha', options.baselineCommitSha));
  }
  if (options.runId) {
    propertyLines.push(propertyLine('run_id', options.runId));
  }
  if (options.promptPath) {
    propertyLines.push(propertyLine('prompt_path', options.promptPath));
  }

  const innerLines: string[] = [];
  if (propertyLines.length > 0) {
    innerLines.push(`  <properties>`);
    innerLines.push(...propertyLines.map((p) => `    ${p}`));
    innerLines.push(`  </properties>`);
  }

  if (failed) {
    innerLines.push(buildFailureElement(row, evalResult, { failedRegression, regressionDelta, tolerance }));
  }

  const testcaseAttrs = [
    `classname="${escapeXmlAttribute(scorerName)}"`,
    `name="${escapeXmlAttribute(rowName)}"`,
    `time="${time}"`,
  ];

  let xml: string;
  if (innerLines.length === 0) {
    xml = `<testcase ${testcaseAttrs.join(' ')}/>`;
  } else {
    xml = [
      `<testcase ${testcaseAttrs.join(' ')}>`,
      ...innerLines,
      `</testcase>`,
    ].join('\n');
  }

  return { xml, failed, regressionFailed: failedRegression };
}

/**
 * Compute the fractional drop in this run's score relative to the baseline,
 * or `null` if either side is missing. Returns a non-negative number; an
 * improvement (score above baseline) returns 0 so the gate never fires on
 * positive movement.
 */
function computeRegressionDelta(evalResult: JUnitEval | null): number | null {
  if (!evalResult) return null;
  if (typeof evalResult.score !== 'number') return null;
  if (typeof evalResult.baselineScore !== 'number') return null;
  if (evalResult.baselineScore <= 0) return null;
  const delta = (evalResult.baselineScore - evalResult.score) / evalResult.baselineScore;
  return delta > 0 ? delta : 0;
}

interface FailureContext {
  failedRegression: boolean;
  regressionDelta: number | null;
  tolerance: number | undefined;
}

function buildFailureElement(
  row: JUnitRow,
  evalResult: JUnitEval | null,
  ctx: FailureContext
): string {
  // Failure message reflects the actual gate that fired. Regression gate
  // (when active) takes precedence in the message because it's the more
  // surprising signal — the scorer itself "passed" but the run regressed
  // below the configured tolerance.
  let message: string;
  if (ctx.failedRegression && ctx.regressionDelta !== null && typeof ctx.tolerance === 'number') {
    const dropPct = (ctx.regressionDelta * 100).toFixed(1);
    const tolPct = (ctx.tolerance * 100).toFixed(1);
    message = evalResult
      ? `${evalResult.name} regressed ${dropPct}% vs baseline (tolerance ${tolPct}%)`
      : `regressed ${dropPct}% vs baseline (tolerance ${tolPct}%)`;
  } else {
    message =
      evalResult?.reason ||
      (evalResult ? `${evalResult.name} did not pass` : 'no evaluator ran');
  }

  const label = (text: string) => text.padEnd(LABEL_WIDTH, ' ');

  const bodyLines = [
    `${label('Input:')}${stringifyForXml(row.input)}`,
    `${label('Actual:')}${stringifyForXml(row.actualOutput)}`,
    `${label('Expected:')}${stringifyForXml(row.expectedOutput)}`,
  ];
  if (evalResult?.reason) bodyLines.push(`${label('Reason:')}${evalResult.reason}`);
  if (typeof evalResult?.score === 'number') {
    bodyLines.push(`${label('Score:')}${evalResult.score}`);
  }
  if (typeof evalResult?.baselineScore === 'number') {
    bodyLines.push(`${label('Baseline:')}${evalResult.baselineScore}`);
  }
  if (ctx.failedRegression && ctx.regressionDelta !== null && typeof ctx.tolerance === 'number') {
    bodyLines.push(`${label('Drop:')}${(ctx.regressionDelta * 100).toFixed(1)}% (tolerance ${(ctx.tolerance * 100).toFixed(1)}%)`);
  }

  return [
    `  <failure message="${escapeXmlAttribute(message)}" type="EvalFailure">`,
    `    ${wrapCdata(bodyLines.join('\n'))}`,
    `  </failure>`,
  ].join('\n');
}

function propertyLine(name: string, value: string): string {
  return `<property name="${escapeXmlAttribute(name)}" value="${escapeXmlAttribute(value)}"/>`;
}

