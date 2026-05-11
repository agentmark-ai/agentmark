import type {
  VerifiedAppId,
  ExperimentParams,
  ExperimentsResponse,
  ExperimentDetail,
} from './types';
import {
  getExperiments as queryExperiments,
  getExperimentById as queryExperimentById,
} from '../routes/experiments';

export class LocalExperimentsService {
  async getExperiments(
    _appId: VerifiedAppId,
    params: ExperimentParams,
    _dataRetentionDays?: number,
  ): Promise<ExperimentsResponse> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const allExperiments = await queryExperiments();

    // Apply filters
    let filtered = allExperiments;
    if (params.promptName) {
      filtered = filtered.filter((e) => e.promptName === params.promptName);
    }
    if (params.datasetPath) {
      filtered = filtered.filter((e) => e.datasetPath === params.datasetPath);
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    // Collect unique filter options
    const promptNames = [...new Set(allExperiments.map((e) => e.promptName).filter(Boolean))];
    const datasetPaths = [...new Set(allExperiments.map((e) => e.datasetPath).filter(Boolean))];

    // Map to the expected ExperimentSummary
    const experiments = paginated.map((e) => ({
      id: e.id,
      name: e.name,
      promptName: e.promptName,
      datasetPath: e.datasetPath,
      itemCount: e.itemCount,
      avgLatencyMs: e.avgLatencyMs,
      totalCost: e.totalCost,
      avgScore: e.avgScore,
      createdAt: e.createdAt,
      commitSha: e.commitSha,
    }));

    return {
      experiments,
      total,
      limit,
      offset,
      filterOptions: {
        promptNames,
        datasetPaths,
      },
    };
  }

  async getExperimentDetail(
    _appId: VerifiedAppId,
    experimentId: string,
    _dataRetentionDays?: number,
  ): Promise<ExperimentDetail | null> {
    const result = await queryExperimentById(experimentId);
    if (!result) return null;

    const { summary, items } = result;

    return {
      id: summary.id,
      name: summary.name,
      promptName: summary.promptName,
      datasetPath: summary.datasetPath,
      itemCount: summary.itemCount,
      avgLatencyMs: summary.avgLatencyMs,
      totalCost: summary.totalCost,
      avgScore: summary.avgScore,
      createdAt: summary.createdAt,
      commitSha: summary.commitSha,
      items: items.map((item) => ({
        traceId: item.traceId,
        itemName: item.itemName,
        expectedOutput: item.expectedOutput,
        input: item.input,
        output: item.actualOutput,
        latencyMs: item.latencyMs,
        cost: item.cost,
        tokens: item.totalTokens || 0,
        model: item.model,
        scores: item.scores.map((s) => ({
          name: s.name,
          score: s.score,
          label: s.label,
          reason: s.reason,
        })),
      })),
    };
  }
}
