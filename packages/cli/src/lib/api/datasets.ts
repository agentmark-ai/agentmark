import { API_URL } from "../../config/api";

export const getDatasets = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_URL}/v1/datasets`);
    if (!response.ok) {
      throw new Error(`Failed to fetch datasets: ${response.statusText}`);
    }
    const data = await response.json();
    return data.datasets || [];
  } catch (error) {
    console.error("Error fetching datasets:", error);
    return [];
  }
};

export const appendToDataset = async (
  datasetPath: string,
  item: { input: any; expected_output: any }
): Promise<void> => {
  const datasetName = encodeURIComponent(datasetPath.replace(/\.jsonl$/, ""));
  const response = await fetch(`${API_URL}/v1/datasets/${datasetName}/rows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Failed to append to dataset: ${response.statusText}`);
  }
};
