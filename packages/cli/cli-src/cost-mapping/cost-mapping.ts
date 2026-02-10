import * as fs from "fs";
import * as path from "path";

// Load model registry JSON directly (avoids needing compiled TS from @repo/model-registry).
const registryDir = path.dirname(
  require.resolve("@repo/model-registry/package.json")
);
const modelsData = JSON.parse(
  fs.readFileSync(path.join(registryDir, "models.json"), "utf-8")
);
const overridesData = JSON.parse(
  fs.readFileSync(path.join(registryDir, "overrides.json"), "utf-8")
);

const allModels: Record<
  string,
  { pricing?: { inputCostPerToken: number; outputCostPerToken: number } }
> = {
  ...modelsData.models,
  ...overridesData.models,
};

let prices: Record<string, { promptPrice: number; completionPrice: number }> =
  {};

export const getModelCostMappings = async (): Promise<{
  [key: string]: { promptPrice: number; completionPrice: number };
}> => {
  if (Object.keys(prices).length > 0) {
    return prices;
  }
  prices = Object.fromEntries(
    Object.entries(allModels)
      .filter(([, m]) => m.pricing)
      .map(([id, m]) => [
        id,
        {
          promptPrice: m.pricing!.inputCostPerToken * 1000,
          completionPrice: m.pricing!.outputCostPerToken * 1000,
        },
      ])
  );
  return prices;
};

export const getCostFormula = (
  inputCost: number,
  outputCost: number,
  unitScale: number
) => {
  return (inputTokens: number, outputTokens: number) => {
    const cost = inputCost * inputTokens + outputCost * outputTokens;
    return cost / unitScale;
  };
};
