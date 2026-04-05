import { describe, it, expect } from "vitest";
import { AgentMark } from "../src/agentmark";
import { DefaultAdapter } from "../src/adapters/default";
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
