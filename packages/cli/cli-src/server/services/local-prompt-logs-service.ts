import type { Database } from 'better-sqlite3';
import type {
  VerifiedAppId,
  PromptLogsParams,
  PromptLogsResponse,
} from './types';
import { mapStatusNameToCode, mapStatusCodeToName, msToIso } from './helpers';

export class LocalPromptLogsService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getPromptLogs(
    _appId: VerifiedAppId,
    params: PromptLogsParams,
    _dataRetentionDays?: number,
  ): Promise<PromptLogsResponse> {
    const limit = params.limit;
    const offset = params.offset;

    const conditions: string[] = ["Type = 'GENERATION'"];
    const queryParams: unknown[] = [];

    if (params.model) {
      conditions.push('Model = ?');
      queryParams.push(params.model);
    }
    if (params.status) {
      const code = mapStatusNameToCode(params.status);
      if (code) {
        conditions.push("(StatusCode = ? OR StatusCode = ? || '.0')");
        queryParams.push(code, code);
      }
    }

    const whereClause = conditions.join(' AND ');

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS total FROM traces WHERE ${whereClause}`
    ).get(...queryParams) as { total: number };

    const rows = this.db.prepare(`
      SELECT
        SpanId AS id,
        COALESCE(Cost, 0.0) AS cost,
        COALESCE(InputTokens, 0) AS promptTokens,
        COALESCE(OutputTokens, 0) AS completionTokens,
        COALESCE(Duration, 0) AS latencyMs,
        COALESCE(Model, '') AS modelUsed,
        CASE
          WHEN StatusCode = '2.0' THEN '2'
          WHEN StatusCode = '2' THEN '2'
          WHEN StatusCode = '1.0' THEN '1'
          WHEN StatusCode = '1' THEN '1'
          ELSE '0'
        END AS statusCode,
        Input AS input,
        CASE
          WHEN Output IS NOT NULL AND Output != '' THEN Output
          WHEN OutputObject IS NOT NULL AND OutputObject != '' THEN OutputObject
          ELSE NULL
        END AS output,
        CAST(Timestamp AS REAL) / 1000000 AS ts,
        COALESCE(UserId, '') AS userId,
        COALESCE(PromptName, '') AS promptName,
        TraceId AS traceId,
        COALESCE(StatusMessage, '') AS statusMessage,
        Props AS props
      FROM traces
      WHERE ${whereClause}
      ORDER BY CAST(Timestamp AS REAL) DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset) as Array<Record<string, unknown>>;

    const logs = rows.map((row) => ({
      id: row.id as string,
      tenantId: '',
      appId: '',
      cost: (row.cost as number) || 0,
      promptTokens: (row.promptTokens as number) || 0,
      completionTokens: (row.completionTokens as number) || 0,
      latencyMs: (row.latencyMs as number) || 0,
      modelUsed: (row.modelUsed as string) || '',
      status: mapStatusCodeToName(String(row.statusCode ?? '0')),
      input: (row.input as string) || '',
      output: (row.output as string) || null,
      ts: msToIso((row.ts as number) || 0),
      userId: (row.userId as string) || '',
      promptName: (row.promptName as string) || '',
      traceId: row.traceId as string,
      statusMessage: (row.statusMessage as string) || '',
      props: (row.props as string) || '',
    }));

    return {
      logs,
      total: countRow.total,
      limit,
      offset,
    };
  }
}
