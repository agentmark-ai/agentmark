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

const LABEL_WIDTH = 11;

export interface JUnitEval {
  name: string;
  score?: number;
  passed?: boolean;
  label?: string;
  reason?: string;
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
   * ISO 8601 timestamp for the suite. Defaults to `new Date().toISOString()` at
   * call time. Override in tests for deterministic output.
   */
  timestamp?: string;
}

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
  const timestamp = options.timestamp ?? new Date().toISOString();
  const testcases = rows.flatMap((row) => buildTestcases(row, options));

  const totalTests = testcases.length;
  const totalFailures = testcases.filter((tc) => tc.failed).length;
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

  return body;
}

interface BuiltTestcase {
  xml: string;
  failed: boolean;
}

function buildTestcases(row: JUnitRow, options: JUnitSuiteOptions): BuiltTestcase[] {
  if (row.evals.length === 0) {
    // No scorers ran on this row — emit a single passing testcase to keep
    // row visibility in the test report.
    return [buildTestcase(row, null, options)];
  }
  return row.evals.map((evalResult) => buildTestcase(row, evalResult, options));
}

function buildTestcase(
  row: JUnitRow,
  evalResult: JUnitEval | null,
  options: JUnitSuiteOptions
): BuiltTestcase {
  const scorerName = evalResult?.name ?? 'no-eval';
  const rowName = row.rowId ?? `row-${row.index}`;
  const time = (row.durationSec ?? 0).toFixed(3);

  const failed = evalResult?.passed === false;

  const propertyLines: string[] = [];
  if (evalResult) {
    propertyLines.push(propertyLine('scorer', evalResult.name));
    if (typeof evalResult.score === 'number') {
      propertyLines.push(propertyLine('score', String(evalResult.score)));
    }
    if (typeof evalResult.passed === 'boolean') {
      propertyLines.push(propertyLine('passed', String(evalResult.passed)));
    }
    if (evalResult.label) {
      propertyLines.push(propertyLine('label', evalResult.label));
    }
  }
  if (options.commitSha) {
    propertyLines.push(propertyLine('commit_sha', options.commitSha));
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
    innerLines.push(buildFailureElement(row, evalResult));
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

  return { xml, failed };
}

function buildFailureElement(row: JUnitRow, evalResult: JUnitEval | null): string {
  const message =
    evalResult?.reason ||
    (evalResult ? `${evalResult.name} did not pass` : 'no evaluator ran');

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

  return [
    `  <failure message="${escapeXmlAttribute(message)}" type="EvalFailure">`,
    `    ${wrapCdata(bodyLines.join('\n'))}`,
    `  </failure>`,
  ].join('\n');
}

function propertyLine(name: string, value: string): string {
  return `<property name="${escapeXmlAttribute(name)}" value="${escapeXmlAttribute(value)}"/>`;
}

