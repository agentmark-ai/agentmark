import prices from "./pricing.json";

export const modelsCostMapping: {
  [key: string]: { promptPrice: number; completionPrice: number };
} = prices;

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
