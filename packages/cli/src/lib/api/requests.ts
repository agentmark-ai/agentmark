import { Request } from "@agentmark-ai/ui-components";
import { API_URL } from "../../config/api";

/**
 * Wire shape returned by `GET /v1/requests` (under `data`). snake_case,
 * `ts` is an ISO datetime string — matches `RequestResponseSchema` in
 * `@agentmark-ai/api-schemas`. The UI `Request` type is the same shape
 * except `ts` is a `Date`, so the only transform on read is parsing it.
 */
interface RequestWire extends Omit<Request, "ts"> {
  ts: string;
}

/**
 * Fetch the list of "requests" (GENERATION-type traces) for the local
 * CLI UI from `GET /v1/requests`.
 *
 * Envelope-aware parsing matches the sibling consumers in this folder
 * (traces, sessions, experiments, scores): the canonical wire shape is
 * `{ data: RequestWire[], pagination: { total, limit, offset } }`. The
 * older flat `{ requests: [...] }` shape is tolerated for safety, and a
 * non-OK response (e.g. the server predates this route) degrades to an
 * empty list rather than crashing the page.
 */
export const getRequests = async (): Promise<Request[]> => {
  try {
    const response = await fetch(`${API_URL}/v1/requests`);
    if (!response.ok) {
      return [];
    }
    const body = await response.json();
    const rows: RequestWire[] = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.requests)
        ? body.requests
        : [];
    return rows.map((r) => ({ ...r, ts: new Date(r.ts) }));
  } catch (error) {
    console.error("Error fetching requests:", error);
    return [];
  }
};
