/**
 * Tests for eval chip label formatting in the trace tree.
 *
 * Validates the score chip label data pipeline: scores from spanScores
 * are formatted as "eval-name: score" before rendering in TraceLabel.
 */

import { describe, it, expect } from "vitest";
import type { ScoreData } from "../../src/sections/traces/types";

// ---------------------------------------------------------------------------
// Helper: format a score as a chip label (mirrors TraceLabel rendering)
// ---------------------------------------------------------------------------

function formatScoreChipLabel(score: ScoreData): string {
  return `${score.name}: ${score.score.toFixed(2)}`;
}

function getScoresFromSpanData(data: Record<string, unknown>): ScoreData[] {
  const scores = data["scores"];
  if (!Array.isArray(scores)) return [];
  return scores as ScoreData[];
}

// ---------------------------------------------------------------------------
// Score chip label formatting
// ---------------------------------------------------------------------------

describe("Eval chip label formatting", () => {
  it("should format score chip label as 'name: score'", () => {
    const score: ScoreData = {
      id: "score-1",
      name: "answer-fit",
      score: 1.0,
      label: "pass",
      reason: "Correct answer",
      source: "eval",
    };

    expect(formatScoreChipLabel(score)).toBe("answer-fit: 1.00");
  });

  it("should format fractional scores with two decimal places", () => {
    const score: ScoreData = {
      id: "score-2",
      name: "coherence",
      score: 0.75,
      label: "",
      reason: "",
      source: "eval",
    };

    expect(formatScoreChipLabel(score)).toBe("coherence: 0.75");
  });

  it("should round scores to two decimal places", () => {
    const score: ScoreData = {
      id: "score-3",
      name: "relevance",
      score: 0.666666,
      label: "",
      reason: "",
      source: "eval",
    };

    expect(formatScoreChipLabel(score)).toBe("relevance: 0.67");
  });

  it("should handle zero score", () => {
    const score: ScoreData = {
      id: "score-4",
      name: "my-eval",
      score: 0,
      label: "fail",
      reason: "",
      source: "annotation",
    };

    expect(formatScoreChipLabel(score)).toBe("my-eval: 0.00");
  });
});

// ---------------------------------------------------------------------------
// Scores extraction from span data
// ---------------------------------------------------------------------------

describe("Scores extraction from span data", () => {
  it("should return scores array from span data.scores", () => {
    const scores: ScoreData[] = [
      { id: "s1", name: "fit", score: 0.9, label: "", reason: "", source: "eval" },
      { id: "s2", name: "coherence", score: 0.8, label: "", reason: "", source: "eval" },
    ];
    const spanData = { type: "GENERATION", scores };

    expect(getScoresFromSpanData(spanData)).toHaveLength(2);
    expect(getScoresFromSpanData(spanData)[0]!.name).toBe("fit");
  });

  it("should return empty array when scores is absent from span data", () => {
    const spanData = { type: "GENERATION" };
    expect(getScoresFromSpanData(spanData)).toEqual([]);
  });

  it("should return empty array when scores is not an array", () => {
    const spanData = { type: "GENERATION", scores: null };
    expect(getScoresFromSpanData(spanData)).toEqual([]);
  });

  it("should return empty array for empty scores array", () => {
    const spanData = { type: "GENERATION", scores: [] };
    expect(getScoresFromSpanData(spanData)).toEqual([]);
  });
});
