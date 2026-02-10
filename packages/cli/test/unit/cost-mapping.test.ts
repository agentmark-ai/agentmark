import { describe, it, expect } from "vitest";
import {
  getModelCostMappings,
  getCostFormula,
} from "../../cli-src/cost-mapping/cost-mapping";

describe("getModelCostMappings", () => {
  it("returns pricing entries from model registry", async () => {
    const prices = await getModelCostMappings();
    expect(Object.keys(prices).length).toBeGreaterThan(0);
  });

  it("includes known models with pricing", async () => {
    const prices = await getModelCostMappings();
    expect(prices["gpt-4o"]).toBeDefined();
    expect(prices["claude-sonnet-4-20250514"]).toBeDefined();
  });

  it("returns per-1K-token pricing format", async () => {
    const prices = await getModelCostMappings();
    const gpt4o = prices["gpt-4o"]!;
    expect(gpt4o).toHaveProperty("promptPrice");
    expect(gpt4o).toHaveProperty("completionPrice");
    expect(typeof gpt4o.promptPrice).toBe("number");
    expect(typeof gpt4o.completionPrice).toBe("number");
    expect(gpt4o.promptPrice).toBeGreaterThan(0);
    expect(gpt4o.completionPrice).toBeGreaterThan(0);
  });

  it("excludes models without pricing (e.g. image models)", async () => {
    const prices = await getModelCostMappings();
    // dall-e models use per-image pricing, not per-token
    expect(prices["dall-e-3"]).toBeUndefined();
  });

  it("caches results on subsequent calls", async () => {
    const first = await getModelCostMappings();
    const second = await getModelCostMappings();
    expect(first).toBe(second); // Same object reference
  });
});

describe("getCostFormula", () => {
  it("calculates cost from input and output tokens", () => {
    const formula = getCostFormula(0.01, 0.03, 1);
    const cost = formula(100, 50);
    // 0.01 * 100 + 0.03 * 50 = 1.0 + 1.5 = 2.5
    expect(cost).toBeCloseTo(2.5);
  });

  it("applies unit scale divisor", () => {
    const formula = getCostFormula(0.01, 0.03, 1000);
    const cost = formula(1000, 500);
    // (0.01 * 1000 + 0.03 * 500) / 1000 = (10 + 15) / 1000 = 0.025
    expect(cost).toBeCloseTo(0.025);
  });

  it("returns zero for zero tokens", () => {
    const formula = getCostFormula(0.01, 0.03, 1);
    expect(formula(0, 0)).toBe(0);
  });
});
