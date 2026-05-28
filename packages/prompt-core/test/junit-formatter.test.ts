import { describe, it, expect } from 'vitest';
import {
  buildJUnitXml,
  buildJUnitReport,
  escapeXmlAttribute,
  escapeXmlText,
  wrapCdata,
  stringifyForXml,
  type JUnitRow,
} from '../src/junit';
import { isRegression } from '../src/gate';

const FIXED_TS = '2026-05-13T00:00:00.000Z';

function suiteOpts(extra: Record<string, unknown> = {}) {
  return {
    suiteName: 'prompts/translate.prompt.mdx',
    timestamp: FIXED_TS,
    ...extra,
  };
}

describe('escapeXmlAttribute', () => {
  it('escapes all five XML predefined entities', () => {
    expect(escapeXmlAttribute(`& < > " '`)).toBe(`&amp; &lt; &gt; &quot; &apos;`);
  });

  it('passes plain text unchanged', () => {
    expect(escapeXmlAttribute('hello world')).toBe('hello world');
  });

  it('strips invalid XML control characters', () => {
    expect(escapeXmlAttribute('a\x00b\x01c\x08d')).toBe('abcd');
  });

  it('keeps allowed whitespace (tab/LF/CR)', () => {
    expect(escapeXmlAttribute('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('handles empty string', () => {
    expect(escapeXmlAttribute('')).toBe('');
  });
});

describe('escapeXmlText', () => {
  it('escapes & < > but not quotes', () => {
    expect(escapeXmlText(`& < > " '`)).toBe(`&amp; &lt; &gt; " '`);
  });

  it('strips invalid control chars', () => {
    expect(escapeXmlText('a\x00b')).toBe('ab');
  });
});

describe('wrapCdata', () => {
  it('wraps plain text', () => {
    expect(wrapCdata('hello')).toBe('<![CDATA[hello]]>');
  });

  it('handles empty string', () => {
    expect(wrapCdata('')).toBe('<![CDATA[]]>');
  });

  it('splits CDATA terminator across two sections', () => {
    // The canonical workaround for embedded `]]>` is to emit two adjacent
    // CDATA sections, splitting the terminator across the boundary.
    const wrapped = wrapCdata('foo]]>bar');
    expect(wrapped).toBe('<![CDATA[foo]]]]><![CDATA[>bar]]>');
    // Each individual CDATA section's *payload* (the content between
    // `<![CDATA[` and `]]>`) must not itself contain `]]>`.
    const sections = wrapped.match(/<!\[CDATA\[([\s\S]*?)\]\]>/g) || [];
    for (const section of sections) {
      const payload = section.slice('<![CDATA['.length, -']]>'.length);
      expect(payload).not.toMatch(/\]\]>/);
    }
  });

  it('strips invalid control characters from CDATA content', () => {
    expect(wrapCdata('a\x00b')).toBe('<![CDATA[ab]]>');
  });
});

describe('stringifyForXml', () => {
  it('returns string unchanged', () => {
    expect(stringifyForXml('hello')).toBe('hello');
  });

  it('JSON-stringifies objects', () => {
    expect(stringifyForXml({ a: 1 })).toBe('{"a":1}');
  });

  it('JSON-stringifies arrays', () => {
    expect(stringifyForXml([1, 2])).toBe('[1,2]');
  });

  it('maps null/undefined to empty string', () => {
    expect(stringifyForXml(null)).toBe('');
    expect(stringifyForXml(undefined)).toBe('');
  });

  it('handles circular references gracefully', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    // Should not throw; should produce some string output.
    const result = stringifyForXml(obj);
    expect(typeof result).toBe('string');
  });
});

describe('buildJUnitXml — structure', () => {
  it('emits XML declaration and root testsuites element', () => {
    const xml = buildJUnitXml([], suiteOpts());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('</testsuites>');
  });

  it('emits a single empty testsuite for an empty run', () => {
    const xml = buildJUnitXml([], suiteOpts());
    expect(xml).toContain('tests="0"');
    expect(xml).toContain('failures="0"');
    expect(xml).toContain('<testsuite');
    expect(xml).toContain('</testsuite>');
  });

  it('counts testcases per (row × scorer) pair', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'a',
        actualOutput: 'A',
        expectedOutput: 'A',
        evals: [
          { name: 'groundedness', score: 0.9, passed: true },
          { name: 'bleu', score: 0.8, passed: true },
        ],
      },
      {
        index: 2,
        input: 'b',
        actualOutput: 'B',
        expectedOutput: 'B',
        evals: [
          { name: 'groundedness', score: 0.95, passed: true },
          { name: 'bleu', score: 0.7, passed: false, reason: 'too literal' },
        ],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toMatch(/tests="4"/);
    expect(xml).toMatch(/failures="1"/);
  });

  it('escapes special characters in the suite name', () => {
    const xml = buildJUnitXml([], suiteOpts({ suiteName: 'a&b<c>d' }));
    expect(xml).toContain('name="a&amp;b&lt;c&gt;d"');
  });

  it('handles a row with no evals as a single passing testcase', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toMatch(/tests="1"/);
    expect(xml).toMatch(/failures="0"/);
    expect(xml).toContain('classname="no-eval"');
  });
});

describe('buildJUnitXml — testcase content', () => {
  it('emits passing testcase as self-closing element with properties', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'hello',
        actualOutput: 'world',
        expectedOutput: 'world',
        evals: [{ name: 'groundedness', score: 0.92, passed: true }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ commitSha: 'd14bac9', runId: 'r1' }));
    expect(xml).toContain('classname="groundedness"');
    expect(xml).toContain('name="row-1"');
    expect(xml).toContain('<property name="scorer" value="groundedness"/>');
    expect(xml).toContain('<property name="score" value="0.92"/>');
    expect(xml).toContain('<property name="passed" value="true"/>');
    expect(xml).toContain('<property name="commit_sha" value="d14bac9"/>');
    expect(xml).toContain('<property name="run_id" value="r1"/>');
    expect(xml).not.toContain('<failure');
  });

  it('emits failing testcase with failure element wrapping CDATA payload', () => {
    const rows: JUnitRow[] = [
      {
        index: 42,
        input: "Translate 'hello' to French",
        actualOutput: 'bonjour',
        expectedOutput: 'Bonjour',
        evals: [{ name: 'groundedness', score: 0.62, passed: false, reason: 'casing wrong' }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toContain('<failure message="casing wrong" type="EvalFailure">');
    expect(xml).toContain('<![CDATA[');
    expect(xml).toContain('Input:');
    expect(xml).toContain('Actual:    bonjour');
    expect(xml).toContain('Expected:  Bonjour');
    expect(xml).toContain('Reason:    casing wrong');
    expect(xml).toContain('Score:     0.62');
  });

  it('synthesizes a failure message when reason is missing', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'exact_match', passed: false }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toContain('<failure message="exact_match did not pass"');
  });

  it('uses explicit rowId when supplied', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        rowId: 'translate-hello-fr',
        input: 'hello',
        actualOutput: 'bonjour',
        expectedOutput: 'bonjour',
        evals: [{ name: 'exact_match', passed: true }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toContain('name="translate-hello-fr"');
  });

  it('embeds duration in seconds on the testcase', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 's', passed: true }],
        durationSec: 1.234,
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toContain('time="1.234"');
  });

  it('rolls up time at the suite level', () => {
    const rows: JUnitRow[] = [
      { index: 1, input: 'x', actualOutput: 'y', expectedOutput: 'z', evals: [{ name: 's', passed: true }], durationSec: 1.0 },
      { index: 2, input: 'x', actualOutput: 'y', expectedOutput: 'z', evals: [{ name: 's', passed: true }], durationSec: 2.5 },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toContain('time="3.500"');
  });
});

describe('buildJUnitXml — escaping inside payload', () => {
  it('escapes special chars in attribute values', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'scorer-with-"quotes"&-amps', passed: false, reason: '<not> "good"' }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toContain('classname="scorer-with-&quot;quotes&quot;&amp;-amps"');
    expect(xml).toContain('message="&lt;not&gt; &quot;good&quot;"');
  });

  it('preserves multi-line input/actual/expected inside CDATA without escaping', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'line1\nline2',
        actualOutput: '<xml>tag</xml>',
        expectedOutput: 'plain',
        evals: [{ name: 's', passed: false }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    // CDATA leaves content as-is; the consuming parser handles it.
    expect(xml).toContain('Input:     line1\nline2');
    expect(xml).toContain('Actual:    <xml>tag</xml>');
  });

  it('embedded CDATA terminator in input is split safely', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'before]]>after',
        actualOutput: 'x',
        expectedOutput: 'y',
        evals: [{ name: 's', passed: false }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    // The raw `]]>` sequence should not survive inside a single CDATA section.
    const cdataMatches = xml.match(/<!\[CDATA\[[\s\S]*?\]\]>/g) || [];
    for (const block of cdataMatches) {
      const payload = block.slice('<![CDATA['.length, -']]>'.length);
      expect(payload).not.toMatch(/\]\]>/);
    }
  });

  it('stringifies object input/output payloads', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: { user: 'alice' },
        actualOutput: { reply: 'hi' },
        expectedOutput: { reply: 'hello' },
        evals: [{ name: 's', passed: false }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toContain('Input:     {"user":"alice"}');
    expect(xml).toContain('Actual:    {"reply":"hi"}');
    expect(xml).toContain('Expected:  {"reply":"hello"}');
  });
});

describe('buildJUnitXml — well-formedness', () => {
  it('produces a parseable document via DOMParser when available', async () => {
    // Use Node's built-in (Node 20+) global DOMParser if present; otherwise skip.
    const Parser = (globalThis as any).DOMParser;
    if (typeof Parser !== 'function') return;
    const xml = buildJUnitXml(
      [
        {
          index: 1,
          input: 'a',
          actualOutput: 'b',
          expectedOutput: 'c',
          evals: [{ name: 's', passed: false, reason: 'r' }],
        },
      ],
      suiteOpts()
    );
    const doc = new Parser().parseFromString(xml, 'text/xml');
    const errorNode = doc.querySelector?.('parsererror');
    expect(errorNode).toBeFalsy();
  });

  it('every opening tag has a matching closing tag', () => {
    const rows: JUnitRow[] = [
      { index: 1, input: 'a', actualOutput: 'b', expectedOutput: 'c', evals: [{ name: 's', passed: true }] },
      { index: 2, input: 'a', actualOutput: 'b', expectedOutput: 'c', evals: [{ name: 's', passed: false }] },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());

    // Count opens vs closes for the structural elements we use.
    const elementsToCheck = ['testsuites', 'testsuite', 'properties'];
    for (const el of elementsToCheck) {
      const opens = (xml.match(new RegExp(`<${el}(\\s|>)`, 'g')) || []).length;
      const closes = (xml.match(new RegExp(`</${el}>`, 'g')) || []).length;
      expect(opens, `${el} opens`).toBe(closes);
    }

    // `<testcase>` may be self-closing (`<testcase ... />`) for passing cases
    // or have a closing tag for failing cases. Count both forms.
    const tcOpens = (xml.match(/<testcase\b[^>]*>/g) || []).length;
    const tcCloses = (xml.match(/<\/testcase>/g) || []).length;
    const tcSelfClose = (xml.match(/<testcase\b[^>]*\/>/g) || []).length;
    expect(tcOpens).toBe(tcCloses + tcSelfClose);
  });

  it('matches the documented JUnit XML shape end-to-end', () => {
    const rows: JUnitRow[] = [
      {
        index: 42,
        input: "Translate 'hello' to French",
        actualOutput: 'bonjour',
        expectedOutput: 'Bonjour',
        durationSec: 1.23,
        evals: [
          { name: 'groundedness', score: 0.62, passed: false, reason: 'casing wrong' },
        ],
      },
    ];

    const xml = buildJUnitXml(rows, suiteOpts({ commitSha: 'd14bac9', runId: 'exp_abc123' }));

    // Snapshot-ish: assert all the parts the spec promises in the issue body.
    expect(xml).toMatch(/<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toMatch(/<testsuites[^>]*name="prompts\/translate\.prompt\.mdx"/);
    expect(xml).toMatch(/<testsuite[^>]*name="prompts\/translate\.prompt\.mdx"[^>]*tests="1"[^>]*failures="1"/);
    expect(xml).toMatch(/<testcase classname="groundedness" name="row-42" time="1\.230">/);
    expect(xml).toContain('<property name="scorer" value="groundedness"/>');
    expect(xml).toContain('<property name="score" value="0.62"/>');
    expect(xml).toContain('<property name="commit_sha" value="d14bac9"/>');
    expect(xml).toContain('<property name="run_id" value="exp_abc123"/>');
    expect(xml).toContain('<failure message="casing wrong" type="EvalFailure">');
    expect(xml).toContain('<![CDATA[');
    expect(xml).toContain('</testcase>');
    expect(xml).toContain('</testsuite>');
    expect(xml).toContain('</testsuites>');
  });
});

describe('buildJUnitXml — regression-vs-baseline gate', () => {
  it('passes when score is at or above baseline (no regression)', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'groundedness', score: 0.92, passed: true, baselineScore: 0.91 }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ regressionTolerance: 0.05 }));
    expect(xml).toMatch(/failures="0"/);
    expect(xml).not.toContain('<failure');
    expect(xml).toContain('<property name="baseline_score" value="0.91"/>');
    expect(xml).toContain('<property name="regression_tolerance" value="0.05"/>');
  });

  it('passes when drop is within tolerance', () => {
    // baseline 0.90, score 0.87 → 3.3% drop → within 5% tolerance
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'groundedness', score: 0.87, passed: true, baselineScore: 0.90 }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ regressionTolerance: 0.05 }));
    expect(xml).toMatch(/failures="0"/);
  });

  it('fails when drop exceeds tolerance, even if absolute passed=true', () => {
    // baseline 0.91, score 0.84 → ~7.7% drop → exceeds 5% tolerance
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'groundedness', score: 0.84, passed: true, baselineScore: 0.91 }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ regressionTolerance: 0.05 }));
    expect(xml).toMatch(/failures="1"/);
    expect(xml).toContain('<failure message="groundedness regressed');
    expect(xml).toContain('vs baseline');
    expect(xml).toContain('tolerance 5.0%');
  });

  it('does not fire regression gate when no baseline is available', () => {
    // Scorer passed absolutely; no baseline → regression check is skipped,
    // case passes. This is the "first run" / "scorer added in PR only" path.
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'new_scorer', score: 0.4, passed: true }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ regressionTolerance: 0.05 }));
    expect(xml).toMatch(/failures="0"/);
    expect(xml).not.toContain('baseline_score');
  });

  it('does not fire when tolerance is not configured', () => {
    // Baseline present but no tolerance → behavior collapses to the absolute
    // gate, which lets the case through here.
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'groundedness', score: 0.5, passed: true, baselineScore: 0.99 }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts());
    expect(xml).toMatch(/failures="0"/);
    expect(xml).not.toContain('regression_tolerance');
  });

  it('AND-combines: absolute pass + regression fail → fail; absolute fail + regression pass → fail', () => {
    const rows: JUnitRow[] = [
      // absolute pass, regression fail
      { index: 1, input: 'x', actualOutput: 'y', expectedOutput: 'z',
        evals: [{ name: 's', score: 0.5, passed: true, baselineScore: 1.0 }] },
      // absolute fail, regression pass (improved)
      { index: 2, input: 'x', actualOutput: 'y', expectedOutput: 'z',
        evals: [{ name: 's', score: 0.9, passed: false, baselineScore: 0.8 }] },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ regressionTolerance: 0.05 }));
    expect(xml).toMatch(/failures="2"/);
  });

  it('regression-failure message names the scorer and quotes the drop', () => {
    const rows: JUnitRow[] = [
      {
        index: 1,
        input: 'x',
        actualOutput: 'y',
        expectedOutput: 'z',
        evals: [{ name: 'faithfulness', score: 0.70, passed: true, baselineScore: 1.0 }],
      },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ regressionTolerance: 0.10 }));
    expect(xml).toMatch(/<failure message="faithfulness regressed 30\.0% vs baseline \(tolerance 10\.0%\)"/);
    expect(xml).toContain('Baseline:  1');
    expect(xml).toContain('Drop:      30.0% (tolerance 10.0%)');
  });

  it('records baseline_commit_sha in <properties> when set', () => {
    const rows: JUnitRow[] = [
      { index: 1, input: 'x', actualOutput: 'y', expectedOutput: 'z',
        evals: [{ name: 's', score: 0.9, passed: true, baselineScore: 0.9 }] },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ baselineCommitSha: 'abc1234' }));
    expect(xml).toContain('<property name="baseline_commit_sha" value="abc1234"/>');
  });

  it('ignores baselineScore <= 0 (avoids division by zero / nonsense ratios)', () => {
    const rows: JUnitRow[] = [
      { index: 1, input: 'x', actualOutput: 'y', expectedOutput: 'z',
        evals: [{ name: 's', score: 0.5, passed: true, baselineScore: 0 }] },
    ];
    const xml = buildJUnitXml(rows, suiteOpts({ regressionTolerance: 0.05 }));
    expect(xml).toMatch(/failures="0"/);
  });
});

describe('buildJUnitReport — failure tallies', () => {
  const baseRow = (evals: JUnitRow['evals']): JUnitRow => ({
    index: 1, input: 'i', actualOutput: 'a', expectedOutput: 'e', evals,
  });

  it('counts regression failures separately from absolute failures', () => {
    const rows: JUnitRow[] = [
      // absolute failure only (no baseline) — should NOT count as regression
      baseRow([{ name: 'exact', score: 0, passed: false }]),
      // regression failure: 0.8 vs baseline 0.95 = ~15.8% drop > 5% tolerance
      baseRow([{ name: 'grounded', score: 0.8, passed: true, baselineScore: 0.95 }]),
    ];
    const report = buildJUnitReport(rows, suiteOpts({ regressionTolerance: 0.05 }));
    expect(report.failures).toBe(2);
    expect(report.regressionFailures).toBe(1);
  });

  it('reports zero regression failures when only absolute checks fail', () => {
    const rows: JUnitRow[] = [baseRow([{ name: 'exact', score: 0, passed: false }])];
    const report = buildJUnitReport(rows, suiteOpts());
    expect(report.failures).toBe(1);
    expect(report.regressionFailures).toBe(0);
  });
});

describe('buildJUnitXml — run-level score_thresholds testcases', () => {
  const noRows: JUnitRow[] = [];

  it('emits a failing run-threshold testcase when mean is below threshold', () => {
    const xml = buildJUnitXml(noRows, suiteOpts({
      scoreThresholds: [{ scorer: 'groundedness', mean: 0.5, threshold: 0.9, count: 3 }],
    }));
    expect(xml).toMatch(/tests="1"/);
    expect(xml).toMatch(/failures="1"/);
    expect(xml).toContain('classname="groundedness" name="run-threshold"');
    expect(xml).toMatch(/<failure message="groundedness mean 0\.500 below threshold 0\.9"/);
    expect(xml).toContain('<property name="mean_score" value="0.5"/>');
    expect(xml).toContain('<property name="threshold" value="0.9"/>');
    expect(xml).toContain('<property name="sample_count" value="3"/>');
  });

  it('emits a passing run-threshold testcase when mean meets threshold', () => {
    const report = buildJUnitReport(noRows, suiteOpts({
      scoreThresholds: [{ scorer: 'groundedness', mean: 0.95, threshold: 0.9, count: 2 }],
    }));
    expect(report.tests).toBe(1);
    expect(report.failures).toBe(0);
    expect(report.regressionFailures).toBe(0);
    expect(report.xml).not.toContain('<failure');
  });
});

describe('isRegression', () => {
  it('fires when the fractional drop exceeds the tolerance', () => {
    // 0.91 → 0.84 is a 7.69% drop, over a 5% tolerance.
    expect(isRegression(0.84, 0.91, 0.05)).toBe(true);
  });

  it('does not fire when the drop is within tolerance', () => {
    // 0.91 → 0.89 is a 2.2% drop, under 5%.
    expect(isRegression(0.89, 0.91, 0.05)).toBe(false);
  });

  it('does not fire exactly at the tolerance boundary (strict >)', () => {
    // 1.0 → 0.9 is exactly a 10% drop; tolerance 0.1 → not a regression.
    expect(isRegression(0.9, 1.0, 0.1)).toBe(false);
  });

  it('does not fire on improvement', () => {
    expect(isRegression(0.95, 0.9, 0.05)).toBe(false);
  });

  it('returns false when tolerance is undefined (gate disabled)', () => {
    expect(isRegression(0.1, 0.9, undefined)).toBe(false);
  });

  it('returns false when score or baseline is missing', () => {
    expect(isRegression(undefined, 0.9, 0.05)).toBe(false);
    expect(isRegression(0.5, undefined, 0.05)).toBe(false);
  });

  it('returns false for a non-positive baseline (fractional drop undefined)', () => {
    expect(isRegression(0, 0, 0.05)).toBe(false);
    expect(isRegression(-0.5, -0.1, 0.05)).toBe(false);
  });
});
