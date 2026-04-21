import type { Database } from 'better-sqlite3';
import type {
  VerifiedAppId,
  DatasetRunParams,
  DatasetRunsResponse,
  DatasetRunDetail,
  DatasetItemSummary,
} from './types';
import { safeQuery } from './helpers';
import {
  getExperimentById as queryExperimentById,
} from '../routes/experiments';

export class LocalDatasetsService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getDatasetRuns(
    _appId: VerifiedAppId,
    params: DatasetRunParams,
    _dataRetentionDays?: number,
  ): Promise<DatasetRunsResponse> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const conditions: string[] = ['root.DatasetRunId IS NOT NULL', "root.DatasetRunId != ''", 'root.ParentSpanId IS NULL'];
    const queryParams: unknown[] = [];

    if (params.datasetPath) {
      conditions.push('root.DatasetPath = ?');
      queryParams.push(params.datasetPath);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = safeQuery(
      () => this.db.prepare(`
        SELECT COUNT(DISTINCT root.DatasetRunId) AS total
        FROM traces root
        WHERE ${whereClause}
      `).get(...queryParams) as { total: number },
      'getDatasetRuns:count',
    );

    const rows = this.db.prepare(`
      SELECT
        root.DatasetRunId AS id,
        COALESCE(NULLIF(root.DatasetRunName, ''), root.DatasetRunId) AS name,
        MAX(NULLIF(root.DatasetPath, '')) AS datasetPath,
        MAX(json_extract(root.Metadata, '$.commit_sha')) AS commitSha,
        MIN(root.CreatedAt) AS start,
        MAX(root.CreatedAt) AS end,
        COUNT(DISTINCT root.TraceId) AS itemCount,
        COALESCE(SUM(gen.item_cost), 0.0) AS totalCost,
        COALESCE(SUM(gen.totalTokens), 0) AS totalTokens,
        AVG(root.Duration) AS avgLatencyMs
      FROM traces root
      LEFT JOIN (
        SELECT TraceId,
          SUM(COALESCE(Cost, 0.0)) AS item_cost,
          SUM(COALESCE(TotalTokens, 0)) AS totalTokens
        FROM traces
        WHERE Model IS NOT NULL AND Model != ''
        GROUP BY TraceId
      ) gen ON gen.TraceId = root.TraceId
      WHERE ${whereClause}
      GROUP BY root.DatasetRunId
      ORDER BY MIN(root.CreatedAt) DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset) as Array<Record<string, unknown>>;

    const runs = rows.map((row) => {
      // Fetch average score for this run
      const scoreRow = safeQuery(
        () => this.db.prepare(`
          SELECT AVG(s.score) AS avg_score
          FROM scores s
          WHERE s.resource_id IN (
            SELECT DISTINCT TraceId FROM traces WHERE DatasetRunId = ?
          )
        `).get(row.id as string) as { avg_score: number | null } | undefined,
        `getDatasetRuns:avgScore(${row.id as string})`,
      );

      return {
        id: row.id as string,
        name: (row.name as string) || '',
        datasetPath: (row.datasetPath as string) || '',
        commitSha: (row.commitSha as string) || '',
        start: (row.start as string) || '',
        end: (row.end as string) || '',
        itemCount: (row.itemCount as number) || 0,
        totalCost: (row.totalCost as number) || 0,
        totalTokens: (row.totalTokens as number) || 0,
        avgLatencyMs: Math.round((row.avgLatencyMs as number) || 0),
        avgScore: scoreRow?.avg_score ?? null,
      };
    });

    return {
      runs,
      total: countRow.total,
      limit,
      offset,
    };
  }

  async getDatasetRunDetail(
    _appId: VerifiedAppId,
    runId: string,
    _dataRetentionDays?: number,
  ): Promise<DatasetRunDetail | null> {
    // Reuse the experiment detail query logic since datasets and experiments
    // share the same underlying data structure
    const result = await queryExperimentById(runId);
    if (!result) return null;

    const { summary, items } = result;

    // Fetch average score for this run
    const scoreRow = this.db.prepare(`
      SELECT AVG(s.score) AS avg_score
      FROM scores s
      WHERE s.resource_id IN (
        SELECT DISTINCT TraceId FROM traces WHERE DatasetRunId = ?
      )
    `).get(runId) as { avg_score: number | null } | undefined;

    const mappedItems: DatasetItemSummary[] = items.map((item, idx) => {
      const itemScore = item.scores.length > 0
        ? item.scores.reduce((sum, s) => sum + s.score, 0) / item.scores.length
        : null;

      return {
        id: item.traceId || String(idx),
        traceId: item.traceId,
        name: item.itemName,
        expectedOutput: item.expectedOutput,
        latencyMs: item.latencyMs,
        cost: item.cost,
        tokens: item.totalTokens || 0,
        score: itemScore,
        status: 'OK', // Root spans in dataset runs are generally successful
      };
    });

    return {
      id: summary.id,
      name: summary.name,
      datasetPath: summary.datasetPath,
      commitSha: summary.commitSha,
      start: summary.createdAt,
      end: summary.createdAt,
      itemCount: summary.itemCount,
      totalCost: summary.totalCost,
      totalTokens: 0,
      avgLatencyMs: summary.avgLatencyMs,
      avgScore: scoreRow?.avg_score ?? null,
      items: mappedItems,
    };
  }
}
