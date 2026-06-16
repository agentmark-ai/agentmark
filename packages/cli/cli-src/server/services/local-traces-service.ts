import type { Database } from 'better-sqlite3';
import type {
  VerifiedAppId,
  TracesParams,
  TracesResponse,
  TraceDetail,
  SpanIO,
} from './types';
import { attachTraceIOPreviews } from '@agentmark-ai/shared-utils';
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
  getTraceIOPreviewRows as queryTraceIOPreviewRows,
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

    const traces: TracesResponse['traces'] = (rows as Array<Record<string, unknown>>).map((row) => {
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

    // Trace-level I/O preview (issue #2899, parity with the cloud trace list):
    // enrich this page with a truncated input/output snippet per trace, derived
    // from each trace's root + GENERATION spans via the canonical
    // `deriveTraceIO`. Best-effort — a query failure degrades to "no preview"
    // rather than failing the whole list.
    try {
      attachTraceIOPreviews(
        traces,
        queryTraceIOPreviewRows(traces.map((t) => t.id)).map((row) => ({
          traceId: row.trace_id,
          parentId: row.parent_id,
          type: row.type,
          timestamp: row.timestamp,
          input: row.input,
          output: row.output,
        })),
      );
    } catch (error) {
      console.error('[LocalTracesService] attachTraceIOPreviews failed:', error);
    }

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
      `SELECT Input, Output, OutputObject, ToolCalls, Metadata FROM traces WHERE TraceId = ? AND SpanId = ?`
    ).get(traceId, spanId) as Record<string, unknown> | undefined;

    if (!row) return null;

    // Metadata is stored as a JSON string; coerce values to strings to match
    // the Record<string, string> wire shape (same handling as the span-list
    // mapper).
    const parsedMeta = safeParse<Record<string, unknown>>(
      typeof row.Metadata === 'string' ? row.Metadata : '',
      {},
    );
    const metadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsedMeta)) {
      metadata[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }

    return {
      input: (row.Input as string) || '',
      output: (row.Output as string) || '',
      outputObject: (row.OutputObject as string) || null,
      toolCalls: (row.ToolCalls as string) || null,
      metadata,
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
