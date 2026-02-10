import { getModelRegistry } from "@repo/model-registry";

let prices: Record<string, { promptPrice: number; completionPrice: number }> = {};

export const getModelCostMappings = async (): Promise<{
  [key: string]: { promptPrice: number; completionPrice: number };
}> => {
  if (Object.keys(prices).length > 0) {
    return prices;
  }
  prices = getModelRegistry().getPricingDictionary();
  return prices;
}

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
