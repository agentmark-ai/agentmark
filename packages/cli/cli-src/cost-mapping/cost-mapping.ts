import { getModelRegistryAsync } from "@agentmark-ai/model-registry";

let prices: Record<string, { promptPrice: number; completionPrice: number }> =
  {};

export const getModelCostMappings = async (): Promise<{
  [key: string]: { promptPrice: number; completionPrice: number };
}> => {
  if (Object.keys(prices).length > 0) {
    return prices;
  }
  const registry = await getModelRegistryAsync();
  const allModels = registry.getAllModels();
  prices = Object.fromEntries(
    allModels
      .filter(
        (m) =>
          m.pricing?.inputCostPerToken != null &&
          m.pricing?.outputCostPerToken != null
      )
      .map((m) => [
        m.id,
        {
          promptPrice: m.pricing!.inputCostPerToken! * 1000,
          completionPrice: m.pricing!.outputCostPerToken! * 1000,
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
