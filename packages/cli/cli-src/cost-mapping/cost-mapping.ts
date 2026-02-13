import modelsData from "@agentmark-ai/model-registry/models.json";
import overridesData from "@agentmark-ai/model-registry/overrides.json";

const allModels: Record<
  string,
  { pricing?: { inputCostPerToken: number; outputCostPerToken: number } }
> = {
  ...(modelsData as any).models,
  ...(overridesData as any).models,
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
    Object.entries(allModels).map(([id, m]) => [
      id,
      {
        promptPrice: (m.pricing?.inputCostPerToken ?? 0) * 1000,
        completionPrice: (m.pricing?.outputCostPerToken ?? 0) * 1000,
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
