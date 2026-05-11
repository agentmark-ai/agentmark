import type { Database } from 'better-sqlite3';
import type {
  VerifiedAppId,
  TracesParams,
  TracesResponse,
  TraceDetail,
  SpanIO,
} from './types';
import {
  mapStatusNameToCode,
  mapStatusCodeToName,
  msToIso,
  safeParse,
  mapRawTraceToDetail,
} from './helpers';
import {
  getTraces as queryTraces,
  getTraceCount as queryTraceCount,
  getTraceById as queryTraceById,
} from '../routes/traces';

export class LocalTracesService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getTraces(
    _appId: VerifiedAppId,
    params: TracesParams,
    _dataRetentionDays?: number,
  ): Promise<TracesResponse> {
    const statusCode = params.status ? mapStatusNameToCode(params.status) : undefined;

    const [rows, total] = await Promise.all([
      queryTraces({
        status: statusCode,
        name: params.name,
        tags: params.tags,
        limit: params.limit,
        offset: params.offset,
        dataset_run_id: params.datasetRunId,
        session_id: params.sessionId,
        commit_sha: params.commitSha,
      }),
      queryTraceCount({
        status: statusCode,
        name: params.name,
        tags: params.tags,
        dataset_run_id: params.datasetRunId,
        session_id: params.sessionId,
        commit_sha: params.commitSha,
      }),
    ]);

    const traces = (rows as Array<Record<string, unknown>>).map((row) => {
      // SQL returns Tags as a JSON-encoded string (e.g. `'["a","b"]'`)
      // courtesy of `json_group_array` in the trace_tags CTE. Parse so
      // wire-mappers can emit a real array on the response.
      let tags: string[] = [];
      const rawTags = row.tags;
      if (typeof rawTags === 'string') {
        try {
          const parsed = JSON.parse(rawTags);
          if (Array.isArray(parsed)) tags = parsed.map(String);
        } catch {
          // Malformed → treat as untagged.
        }
      } else if (Array.isArray(rawTags)) {
        tags = rawTags.map(String);
      }

      return {
        id: row.id as string,
        name: (row.name as string) || '',
        status: mapStatusCodeToName(String(row.status ?? '0')),
        start: msToIso((row.start as number) || 0),
        end: msToIso((row.end as number) || 0),
        latencyMs: (row.latency as number) || 0,
        cost: (row.cost as number) || 0,
        tokens: (row.tokens as number) || 0,
        spanCount: (row.span_count as number) || 0,
        tags,
      };
    });

    return {
      traces,
      total,
      limit: params.limit,
      offset: params.offset,
    };
  }

  async getTraceDetail(
    _appId: VerifiedAppId,
    traceId: string,
    _dataRetentionDays?: number,
  ): Promise<TraceDetail | null> {
    const raw = await queryTraceById(traceId);
    if (!raw) return null;
    return mapRawTraceToDetail(raw as unknown as Record<string, unknown>);
  }

  async getTraceDetailLightweight(
    _appId: VerifiedAppId,
    traceId: string,
    _dataRetentionDays?: number,
  ): Promise<TraceDetail | null> {
    // Local: same as full detail (no optimization needed for SQLite)
    return this.getTraceDetail(_appId, traceId, _dataRetentionDays);
  }

  async getSpanIO(
    _appId: VerifiedAppId,
    traceId: string,
    spanId: string,
    _dataRetentionDays?: number,
  ): Promise<SpanIO | null> {
    const row = this.db.prepare(
      `SELECT Input, Output, OutputObject, ToolCalls FROM traces WHERE TraceId = ? AND SpanId = ?`
    ).get(traceId, spanId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      input: (row.Input as string) || '',
      output: (row.Output as string) || '',
      outputObject: (row.OutputObject as string) || null,
      toolCalls: (row.ToolCalls as string) || null,
    };
  }

  async getDistinctMetadataKeys(
    _appId: VerifiedAppId,
    _dataRetentionDays?: number,
  ): Promise<string[]> {
    const rows = this.db.prepare(
      `SELECT DISTINCT Metadata FROM traces WHERE Metadata IS NOT NULL AND Metadata != ''`
    ).all() as Array<{ Metadata: string }>;

    const keys = new Set<string>();
    for (const row of rows) {
      const parsed = safeParse<Record<string, unknown>>(row.Metadata, {});
      for (const key of Object.keys(parsed)) {
        keys.add(key);
      }
    }

    return [...keys].sort();
  }
}
