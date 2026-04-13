import { describe, it, expect } from "vitest";
import {
  ScoreSchemaDefinition,
  ScoreDefinitionSchema,
  serializeScoreRegistry,
} from "../src/scores";
import type { ScoreRegistry } from "../src/scores";

describe("ScoreSchemaDefinition (Zod)", () => {
  it("accepts a valid numeric schema", () => {
    const result = ScoreSchemaDefinition.safeParse({
      type: "numeric",
      min: 1,
      max: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts numeric schema without bounds", () => {
    const result = ScoreSchemaDefinition.safeParse({ type: "numeric" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid categorical schema with label+value pairs", () => {
    const result = ScoreSchemaDefinition.safeParse({
      type: "categorical",
      categories: [
        { label: "good", value: 1 },
        { label: "bad", value: 0 },
        { label: "neutral", value: 0.5 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects categorical schema with empty categories", () => {
    const result = ScoreSchemaDefinition.safeParse({
      type: "categorical",
      categories: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid boolean schema", () => {
    const result = ScoreSchemaDefinition.safeParse({ type: "boolean" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const result = ScoreSchemaDefinition.safeParse({ type: "text" });
    expect(result.success).toBe(false);
  });

  it("rejects categorical schema without categories field", () => {
    const result = ScoreSchemaDefinition.safeParse({ type: "categorical" });
    expect(result.success).toBe(false);
  });
});

describe("ScoreDefinitionSchema (Zod)", () => {
  it("accepts schema-only definition (human-only score)", () => {
    const result = ScoreDefinitionSchema.safeParse({
      schema: { type: "numeric", min: 1, max: 5 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts definition with description", () => {
    const result = ScoreDefinitionSchema.safeParse({
      schema: { type: "boolean" },
      description: "Whether the output is correct",
    });
    expect(result.success).toBe(true);
  });

  it("rejects definition without schema field", () => {
    const result = ScoreDefinitionSchema.safeParse({
      description: "missing schema",
    });
    expect(result.success).toBe(false);
  });
});

describe("serializeScoreRegistry", () => {
  it("strips eval functions and sets hasEval flag", () => {
    const registry: ScoreRegistry = {
      accuracy: {
        schema: { type: "boolean" },
        eval: async () => ({ passed: true }),
      },
      quality: {
        schema: { type: "numeric", min: 1, max: 5 },
        description: "Overall quality",
      },
    };

    const result = serializeScoreRegistry(registry);

    expect(result).toEqual([
      { name: "accuracy", schema: { type: "boolean" }, hasEval: true },
      {
        name: "quality",
        schema: { type: "numeric", min: 1, max: 5 },
        description: "Overall quality",
        hasEval: false,
      },
    ]);
    const json = JSON.stringify(result);
    expect(json).not.toContain("function");
  });

  it("returns empty array for empty registry", () => {
    expect(serializeScoreRegistry({})).toEqual([]);
  });

  it("handles all three schema types", () => {
    const registry: ScoreRegistry = {
      a: { schema: { type: "boolean" } },
      b: { schema: { type: "numeric", min: 0, max: 100 } },
      c: {
        schema: {
          type: "categorical",
          categories: [{ label: "good", value: 1 }, { label: "bad", value: 0 }],
        },
      },
    };

    const result = serializeScoreRegistry(registry);
    expect(result).toHaveLength(3);
    expect(result[0].schema.type).toBe("boolean");
    expect(result[1].schema.type).toBe("numeric");
    expect(result[2].schema.type).toBe("categorical");
  });
});
