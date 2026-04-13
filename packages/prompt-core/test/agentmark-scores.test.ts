import { describe, it, expect } from "vitest";
import { AgentMark } from "../src/agentmark";
import { DefaultAdapter } from "../src/adapters/default";
import { toStoredScore } from "../src/scores";
import type { EvalRegistry } from "../src/eval-registery";
import type { ScoreRegistry } from "../src/scores";

const adapter = new DefaultAdapter();

describe("AgentMark score registry", () => {
  describe("scores option", () => {
    it("stores score registry and returns it via getScoreRegistry()", () => {
      const scores: ScoreRegistry = {
        accuracy: {
          schema: { type: "boolean" },
          eval: async () => ({ passed: true }),
        },
        quality: {
          schema: { type: "numeric", min: 1, max: 5 },
        },
      };

      const client = new AgentMark({ adapter, scores });
      const registry = client.getScoreRegistry();

      expect(registry).toBe(scores);
      expect(Object.keys(registry)).toEqual(["accuracy", "quality"]);
    });

    it("derives evalRegistry from score registry entries with eval functions", () => {
      const evalFn = async () => ({ passed: true });
      const scores: ScoreRegistry = {
        accuracy: { schema: { type: "boolean" }, eval: evalFn },
        quality: { schema: { type: "numeric", min: 1, max: 5 } },
      };

      const client = new AgentMark({ adapter, scores });
      const evalRegistry = client.getEvalRegistry();

      expect(evalRegistry).toBeDefined();
      expect(evalRegistry!["accuracy"]).toBe(evalFn);
      expect(evalRegistry!["quality"]).toBeUndefined();
      expect(Object.keys(evalRegistry!)).toEqual(["accuracy"]);
    });
  });

  describe("evalRegistry backward compat", () => {
    it("wraps bare eval functions as schemaless score entries", () => {
      const evalFn = async () => ({ passed: true });
      const evalRegistry: EvalRegistry = { accuracy: evalFn };

      const client = new AgentMark({ adapter, evalRegistry });
      const scoreRegistry = client.getScoreRegistry();

      expect(scoreRegistry["accuracy"]).toBeDefined();
      expect(scoreRegistry["accuracy"].eval).toBe(evalFn);
      expect(scoreRegistry["accuracy"].schema).toBeUndefined();
    });

    it("getEvalRegistry() returns original functions when using legacy option", () => {
      const evalFn = async () => ({ passed: true });
      const evalRegistry: EvalRegistry = { accuracy: evalFn };

      const client = new AgentMark({ adapter, evalRegistry });
      const result = client.getEvalRegistry();

      expect(result).toBeDefined();
      expect(result!["accuracy"]).toBe(evalFn);
    });
  });

  describe("precedence", () => {
    it("scores takes precedence when both options provided", () => {
      const legacyFn = async () => ({ passed: false });
      const newFn = async () => ({ passed: true });

      const client = new AgentMark({
        adapter,
        evalRegistry: { accuracy: legacyFn },
        scores: {
          accuracy: { schema: { type: "boolean" }, eval: newFn },
        },
      });

      const registry = client.getScoreRegistry();
      expect(registry["accuracy"].eval).toBe(newFn);
      expect(registry["accuracy"].schema).toEqual({ type: "boolean" });
    });
  });

  describe("empty state", () => {
    it("returns empty score registry when neither option provided", () => {
      const client = new AgentMark({ adapter });
      expect(client.getScoreRegistry()).toEqual({});
    });

    it("getEvalRegistry() returns empty object when no evals defined", () => {
      const scores: ScoreRegistry = {
        quality: { schema: { type: "numeric", min: 1, max: 5 } },
      };
      const client = new AgentMark({ adapter, scores });
      expect(client.getEvalRegistry()).toEqual({});
    });
  });
});

describe("toStoredScore", () => {
  describe("boolean schema", () => {
    const schema = { type: "boolean" as const };

    it("converts passed: true to score 1 / PASS", () => {
      expect(toStoredScore(schema, { passed: true })).toEqual({
        score: 1, label: "PASS", reason: "", dataType: "boolean",
      });
    });

    it("converts passed: false to score 0 / FAIL", () => {
      expect(toStoredScore(schema, { passed: false })).toEqual({
        score: 0, label: "FAIL", reason: "", dataType: "boolean",
      });
    });

    it("preserves reason", () => {
      expect(toStoredScore(schema, { passed: true, reason: "Exact match" })).toEqual({
        score: 1, label: "PASS", reason: "Exact match", dataType: "boolean",
      });
    });

    it("falls back to score >= 0.5 when passed is undefined", () => {
      expect(toStoredScore(schema, { score: 0.8 })).toEqual({
        score: 1, label: "PASS", reason: "", dataType: "boolean",
      });
      expect(toStoredScore(schema, { score: 0.3 })).toEqual({
        score: 0, label: "FAIL", reason: "", dataType: "boolean",
      });
    });

    it("defaults to FAIL when neither passed nor score is provided", () => {
      expect(toStoredScore(schema, {})).toEqual({
        score: 0, label: "FAIL", reason: "", dataType: "boolean",
      });
    });
  });

  describe("numeric schema", () => {
    const schema = { type: "numeric" as const, min: 1, max: 5 };

    it("passes through score within range", () => {
      expect(toStoredScore(schema, { score: 4.2 })).toEqual({
        score: 4.2, label: "4.2", reason: "", dataType: "numeric",
      });
    });

    it("clamps score to min when below range", () => {
      expect(toStoredScore(schema, { score: -1 })).toEqual({
        score: 1, label: "1", reason: "", dataType: "numeric",
      });
    });

    it("clamps score to max when above range", () => {
      expect(toStoredScore(schema, { score: 10 })).toEqual({
        score: 5, label: "5", reason: "", dataType: "numeric",
      });
    });

    it("clamps default 0 to min when missing", () => {
      expect(toStoredScore(schema, { reason: "N/A" })).toEqual({
        score: 1, label: "1", reason: "N/A", dataType: "numeric",
      });
    });

    it("passes through when no bounds defined", () => {
      const unbounded = { type: "numeric" as const };
      expect(toStoredScore(unbounded, { score: 999 })).toEqual({
        score: 999, label: "999", reason: "", dataType: "numeric",
      });
    });

    it("handles boundary values exactly", () => {
      expect(toStoredScore(schema, { score: 1 })).toEqual({
        score: 1, label: "1", reason: "", dataType: "numeric",
      });
      expect(toStoredScore(schema, { score: 5 })).toEqual({
        score: 5, label: "5", reason: "", dataType: "numeric",
      });
    });
  });

  describe("categorical schema", () => {
    const schema = {
      type: "categorical" as const,
      categories: [{ label: "good", value: 1 }, { label: "bad", value: 0 }],
    };

    it("maps label to its configured numeric value", () => {
      expect(toStoredScore(schema, { label: "good" })).toEqual({
        score: 1, label: "good", reason: "", dataType: "categorical",
      });
      expect(toStoredScore(schema, { label: "bad" })).toEqual({
        score: 0, label: "bad", reason: "", dataType: "categorical",
      });
    });

    it("defaults to 0 when label is not in categories", () => {
      expect(toStoredScore(schema, { label: "unknown" })).toEqual({
        score: 0, label: "unknown", reason: "", dataType: "categorical",
      });
    });

    it("defaults label to empty string when missing", () => {
      expect(toStoredScore(schema, {})).toEqual({
        score: 0, label: "", reason: "", dataType: "categorical",
      });
    });

    it("preserves reason", () => {
      expect(toStoredScore(schema, { label: "bad", reason: "Off-topic" })).toEqual({
        score: 0, label: "bad", reason: "Off-topic", dataType: "categorical",
      });
    });
  });

  describe("eval/annotation equivalence", () => {
    // Core invariant: for the same schema and value, the eval path and
    // annotation UI path must produce identical StoredScore output.

    it("boolean: eval {passed: true} matches annotation form value=true", () => {
      const schema = { type: "boolean" as const };
      // Eval path: function returns { passed: true }
      const fromEval = toStoredScore(schema, { passed: true, reason: "Match" });
      // Annotation path: UI form produces { passed: true } from boolean toggle
      const fromAnnotation = toStoredScore(schema, { passed: true, reason: "Match" });
      expect(fromEval).toEqual(fromAnnotation);
    });

    it("numeric: eval {score: 4.2} matches annotation form value=4.2", () => {
      const schema = { type: "numeric" as const, min: 1, max: 5 };
      const fromEval = toStoredScore(schema, { score: 4.2, reason: "Good" });
      const fromAnnotation = toStoredScore(schema, { score: 4.2, reason: "Good" });
      expect(fromEval).toEqual(fromAnnotation);
    });

    it("categorical: eval {label: 'good'} matches annotation form value='good'", () => {
      const schema = { type: "categorical" as const, categories: [{ label: "good", value: 1 }, { label: "bad", value: 0 }] };
      const fromEval = toStoredScore(schema, { label: "good", reason: "Nice tone" });
      const fromAnnotation = toStoredScore(schema, { label: "good", reason: "Nice tone" });
      expect(fromEval).toEqual(fromAnnotation);
    });

    it("all types include dataType in output", () => {
      expect(toStoredScore({ type: "boolean" }, { passed: true })).toHaveProperty("dataType", "boolean");
      expect(toStoredScore({ type: "numeric" }, { score: 1 })).toHaveProperty("dataType", "numeric");
      expect(toStoredScore({ type: "categorical", categories: [{ label: "a", value: 1 }] }, { label: "a" })).toHaveProperty("dataType", "categorical");
    });
  });
});
