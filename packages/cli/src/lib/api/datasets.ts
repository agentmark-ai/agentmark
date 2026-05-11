import { API_URL } from "../../config/api";

export const getDatasets = async (): Promise<string[]> => {
  try {
    // /v1/datasets returns the canonical paginated envelope:
    //   { data: [{ name, row_count, created_at }], pagination: {...} }
    // The dialog only consumes names; extract them and discard the metadata.
    // limit=1000 is the max accepted by the schema and large enough for any
    // realistic project — pagination over the dialog isn't a UX we need.
    const response = await fetch(`${API_URL}/v1/datasets?limit=1000`);
    if (!response.ok) {
      throw new Error(`Failed to fetch datasets: ${response.statusText}`);
    }
    const body = await response.json();
    // The api-server emits the canonical paginated envelope:
    //   { data: [{ name, row_count, created_at }], pagination: {...} }
    // (see cli-src/api-server.ts at the `/v1/datasets` handler). Extract
    // names; row_count / created_at aren't consumed by the dialog.
    const rows: Array<{ name: string }> = Array.isArray(body?.data) ? body.data : [];
    return rows.map((r) => r.name);
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
