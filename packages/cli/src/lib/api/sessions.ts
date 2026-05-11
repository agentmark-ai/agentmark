import { TraceData } from "@agentmark-ai/ui-components";
import { API_URL } from "../../config/api";

export interface Session {
  id: string;
  name: string | null;
  start: number;
  end: number | null;
  tenant_id: string | null;
  app_id: string | null;
  traceCount?: number;
  totalCost?: number;
  totalTokens?: number;
  latency?: number;
  tags?: string[];
}

// Re-export SessionData from ui-components for type compatibility
export type { SessionData } from "@agentmark-ai/ui-components";

// Wire-side shape returned by GET /v1/sessions (under `data`). The
// canonical envelope is `{ data: SessionWire[], pagination: ... }` and
// the inner shape matches `SessionResponseSchema` in
// @agentmark-ai/api-schemas (snake_case, with `start`/`end` as ISO
// datetime strings).
//
// The CLI's `Session` consumer-shape was authored against an older,
// camelCase wire and never updated when the canonical wire moved to
// snake_case. The page-level mapper in `app/sessions/page.tsx` reads
// `s.traceCount`, `s.totalCost`, `s.totalTokens`, `s.latency` — none of
// which existed on the new wire — so every session row silently
// rendered "-" for stats. Translation lives here so future wire-shape
// changes only need one edit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WireSession = Record<string, any>;

function wireSessionToSession(s: WireSession): Session {
  // Wire emits `start`/`end` as ISO datetime strings. The CLI Session
  // interface and the downstream `SessionData` UI type both expect
  // milliseconds-since-epoch, so parse here. `new Date(undefined)` is
  // Invalid Date → `.getTime()` returns NaN; guard against that.
  const startMs =
    typeof s.start === "number"
      ? s.start
      : s.start
        ? Date.parse(String(s.start))
        : 0;
  const endMs =
    typeof s.end === "number"
      ? s.end
      : s.end
        ? Date.parse(String(s.end))
        : null;
  return {
    id: String(s.id ?? ""),
    name: s.name ?? null,
    start: Number.isFinite(startMs) ? startMs : 0,
    end: endMs !== null && Number.isFinite(endMs) ? endMs : null,
    tenant_id: s.tenant_id ?? s.tenantId ?? null,
    app_id: s.app_id ?? s.appId ?? null,
    // Translate snake_case wire fields into the CLI's camelCase
    // consumer shape. The page-level mapper reads these names; without
    // the translation every stat column on /sessions silently
    // reads `undefined`.
    traceCount: s.trace_count ?? s.traceCount,
    totalCost: s.total_cost ?? s.totalCost,
    totalTokens: s.total_tokens ?? s.totalTokens,
    latency: s.latency_ms ?? s.latency,
    tags: Array.isArray(s.tags) ? s.tags : undefined,
  };
}

export interface GetSessionsResponse {
  sessions: Session[];
  total: number;
}

export const getSessions = async (): Promise<Session[]> => {
  const { sessions } = await getSessionsWithTotal();
  return sessions;
};

export const getSessionsWithTotal = async (): Promise<GetSessionsResponse> => {
  try {
    const response = await fetch(`${API_URL}/v1/sessions`);
    const body = await response.json();
    // Canonical wire shape (matches `SessionsListResponseSchema` in
    // @agentmark-ai/api-schemas):
    //   { data: SessionWire[], pagination: { total, limit, offset } }
    // Tolerate the older `{ sessions: [...] }` shape for safety.
    const rawSessions: WireSession[] = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.sessions)
        ? body.sessions
        : [];
    const sessions = rawSessions.map(wireSessionToSession);
    const total = body?.pagination?.total ?? body?.total ?? sessions.length;
    return { sessions, total };
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return { sessions: [], total: 0 };
  }
};

export const getTracesBySessionId = async (
  sessionId: string
): Promise<TraceData[]> => {
  try {
    // Session-scoping is a filter, not a sub-resource. The old
    // `/v1/sessions/{id}/traces` path is deprecated (Sunset 2026-10-21)
    // in favor of `GET /v1/traces?session_id={id}` on the canonical
    // list endpoint.
    const qs = new URLSearchParams({ session_id: sessionId });
    const response = await fetch(`${API_URL}/v1/traces?${qs.toString()}`);
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch traces: ${response.statusText}`);
    }
    const body = await response.json();
    // Tolerate both the canonical `{ data, pagination }` envelope and
    // the legacy `{ traces, total }` shape older mock servers emit.
    const traces = Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.traces)
        ? body.traces
        : [];
    return traces as TraceData[];
  } catch (error) {
    console.error("Error fetching traces for session:", error);
    return [];
  }
};

