import type { Database } from 'better-sqlite3';
import type {
  VerifiedAppId,
  SessionsParams,
  SessionsResponse,
  TraceDetail,
} from './types';
import { msToIso, mapRawTraceToDetail } from './helpers';
import { getTracesBySessionId as queryTracesBySessionId } from '../routes/traces';

export class LocalSessionsService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getSessions(
    _appId: VerifiedAppId,
    params: SessionsParams,
    _dataRetentionDays?: number,
  ): Promise<SessionsResponse> {
    const limit = params.limit;
    const offset = params.offset;

    const countRow = this.db.prepare(`
      SELECT COUNT(DISTINCT SessionId) AS total
      FROM traces
      WHERE SessionId IS NOT NULL AND SessionId != '' AND SessionId != 'null'
    `).get() as { total: number };

    const rows = this.db.prepare(`
      WITH session_traces AS (
        SELECT
          TRIM(SessionId) AS session_id,
          TraceId AS trace_id,
          SessionName AS session_name
        FROM traces
        WHERE SessionId IS NOT NULL
          AND SessionId != ''
          AND SessionId != 'null'
        GROUP BY SessionId, TraceId
      ),
      all_session_spans AS (
        SELECT
          st.session_id,
          st.session_name,
          t.TraceId AS trace_id,
          CAST(t.Timestamp AS REAL) / 1000000 AS timestamp,
          COALESCE(t.Cost, 0) AS cost,
          COALESCE(t.TotalTokens, 0) AS total_tokens,
          COALESCE(t.Duration, 0) AS duration,
          t.TraceName AS trace_name,
          t.PromptName AS prompt_name
        FROM session_traces st
        JOIN traces t ON t.TraceId = st.trace_id
      )
      SELECT
        session_id AS id,
        MIN(timestamp) AS start_ts,
        MAX(timestamp) AS end_ts,
        COALESCE(
          MIN(CASE WHEN session_name IS NOT NULL AND session_name != '' THEN session_name ELSE NULL END),
          MIN(CASE WHEN prompt_name IS NOT NULL AND prompt_name != '' THEN prompt_name ELSE NULL END),
          MIN(CASE WHEN trace_name IS NOT NULL AND trace_name != '' THEN trace_name ELSE NULL END)
        ) AS name,
        COUNT(DISTINCT trace_id) AS traceCount,
        SUM(cost) AS totalCost,
        SUM(total_tokens) AS totalTokens,
        MAX(duration) AS latencyMs
      FROM all_session_spans
      WHERE session_id IS NOT NULL AND session_id != ''
      GROUP BY session_id
      ORDER BY start_ts DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Array<Record<string, unknown>>;

    const sessions = rows.map((row) => ({
      id: row.id as string,
      name: (row.name as string) || '',
      start: msToIso((row.start_ts as number) || 0),
      end: msToIso((row.end_ts as number) || 0),
      traceCount: (row.traceCount as number) || 0,
      totalCost: (row.totalCost as number) || 0,
      totalTokens: (row.totalTokens as number) || 0,
      latencyMs: (row.latencyMs as number) || 0,
    }));

    return {
      sessions,
      total: countRow.total,
      limit,
      offset,
    };
  }

  async getSessionTraces(
    _appId: VerifiedAppId,
    sessionId: string,
    _dataRetentionDays?: number,
  ): Promise<TraceDetail[]> {
    const rawTraces = await queryTracesBySessionId(sessionId);
    return (rawTraces as Array<Record<string, unknown>>).map(
      (raw) => mapRawTraceToDetail(raw as Record<string, unknown>)
    );
  }
}
