let prices: Record<string, { promptPrice: number; completionPrice: number }> = {};

const pricesUrl = "https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/cli-src/cost-mapping/pricing.json"
export const getModelCostMappings = async (): Promise<{
  [key: string]: { promptPrice: number; completionPrice: number };
}> => {
  if (Object.keys(prices).length > 0) {
    return prices;
  }
  // If no prices URL configured, return empty mappings
  if (!pricesUrl) {
    return prices;
  }
  const res = await fetch(pricesUrl)
  const data = await res.json()
  prices = data
  return prices
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
