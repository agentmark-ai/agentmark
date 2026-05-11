import { API_URL } from "../../config/api";

export interface ExperimentSummary {
  id: string;
  name: string;
  promptName: string;
  datasetPath: string;
  itemCount: number;
  avgLatencyMs: number;
  totalCost: number;
  avgScore: number | null;
  createdAt: string;
  commitSha: string;
}

export interface ExperimentItem {
  traceId: string;
  itemName: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  latencyMs: number;
  cost: number;
  totalTokens: number;
  model: string;
  scores: Array<{ name: string; score: number; label: string; reason: string }>;
}

// Local consumer shape — keeps the existing `{ summary, items }` nesting
// that the page-level `toSharedDetail` mappers rely on. The api-server
// emits a flat shape (matches `ExperimentDetailSchema` in
// @agentmark-ai/api-schemas: `ExperimentSummary` + `items`), so
// `getExperimentById` reshapes flat→nested at the boundary.
export interface ExperimentDetail {
  summary: ExperimentSummary;
  items: ExperimentItem[];
}

// Wire-side shape returned by GET /v1/experiments/:id (under `data`).
// The fields below mirror cli-src/server/services/local-experiments-service.ts
// and ExperimentDetailSchema / ExperimentItemSummarySchema.
interface WireExperimentItem {
  traceId: string;
  itemName: string;
  input: string;
  expectedOutput: string;
  output: string;
  latencyMs: number;
  cost: number;
  tokens: number;
  model: string;
  scores: Array<{ name: string; score: number; label: string; reason: string }>;
}

interface WireExperimentDetail extends ExperimentSummary {
  items: WireExperimentItem[];
}

export interface GetExperimentsResponse {
  experiments: ExperimentSummary[];
  total: number;
}

export const getExperiments = async (): Promise<ExperimentSummary[]> => {
  const { experiments } = await getExperimentsWithTotal();
  return experiments;
};

export const getExperimentsWithTotal = async (): Promise<GetExperimentsResponse> => {
  try {
    const response = await fetch(`${API_URL}/v1/experiments`);
    const body = await response.json();
    // Canonical wire shape (matches `ExperimentsListResponseSchema` in
    // @agentmark-ai/api-schemas):
    //   { data: ExperimentSummary[], pagination: { total, limit, offset } }
    // Tolerate the older `{ experiments: [...] }` shape for safety.
    const experiments: ExperimentSummary[] = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.experiments)
        ? body.experiments
        : [];
    // Surface pagination.total. Without this, the experiments list page
    // hardcoded `total={experiments.length}`, which silently mis-reported
    // "X of N" once the user paginated past the default 50-row window.
    const total = body?.pagination?.total ?? body?.total ?? experiments.length;
    return { experiments, total };
  } catch (error) {
    console.error("Error fetching experiments:", error);
    return { experiments: [], total: 0 };
  }
};

export const getExperimentById = async (
  experimentId: string
): Promise<ExperimentDetail | null> => {
  try {
    // Encode experimentId so IDs containing special characters (slashes,
    // spaces, query separators) round-trip through the URL path safely
    // — matches the encoding pattern used by the trace detail consumer
    // in `traces.ts:getTraceById`.
    const response = await fetch(`${API_URL}/v1/experiments/${encodeURIComponent(experimentId)}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch experiment: ${response.statusText}`);
    }
    const body = await response.json();
    // Canonical wire shape (matches `ExperimentDetailResponseSchema` in
    // @agentmark-ai/api-schemas):
    //   { data: ExperimentSummary & { items: ExperimentItemSummary[] } }
    // Tolerate a bare detail object (no envelope) for older fixtures.
    const wire = (body?.data ?? body) as Partial<WireExperimentDetail> | null;
    if (!wire || typeof wire !== "object" || !("id" in wire)) {
      return null;
    }
    const w = wire as WireExperimentDetail;
    // Reshape flat → nested ({ summary, items }) so the existing
    // page-level `toSharedDetail` mappers continue to work unchanged.
    // Wire field names (`output`, `tokens`) get translated to local
    // names (`actualOutput`, `totalTokens`) here.
    return {
      summary: {
        id: w.id,
        name: w.name,
        promptName: w.promptName,
        datasetPath: w.datasetPath,
        itemCount: w.itemCount,
        avgLatencyMs: w.avgLatencyMs,
        totalCost: w.totalCost,
        avgScore: w.avgScore,
        createdAt: w.createdAt,
        commitSha: w.commitSha,
      },
      items: (w.items ?? []).map((item) => ({
        traceId: item.traceId,
        itemName: item.itemName,
        input: item.input,
        expectedOutput: item.expectedOutput,
        actualOutput: item.output,
        latencyMs: item.latencyMs,
        cost: item.cost,
        totalTokens: item.tokens,
        model: item.model,
        scores: item.scores ?? [],
      })),
    };
  } catch (error) {
    console.error("Error fetching experiment:", error);
    return null;
  }
};
