import { Request } from "@agentmark-ai/ui-components";
import { API_URL } from "../../config/api";

/**
 * Fetch the list of "requests" for the local CLI UI.
 *
 * The api-server currently has no `/v1/requests` route, so this call
 * always 404s with the canonical error envelope. We treat that as an
 * empty list rather than crashing the page — the page is shipped in
 * the sidebar nav and visited by users browsing the dev UI; a blank
 * "no requests yet" state is the right surface until the route exists.
 *
 * The envelope-aware parsing matches the sibling consumers in this
 * folder (traces, sessions, experiments, scores) and keeps the read
 * forward-compatible if the server ever adds the endpoint with the
 * canonical `{ data, pagination }` shape.
 */
export const getRequests = async (): Promise<Request[]> => {
  try {
    const response = await fetch(`${API_URL}/v1/requests`);
    if (!response.ok) {
      return [];
    }
    const body = await response.json();
    // Canonical wire shape (matches the rest of /v1/* on this server):
    //   { data: Request[], pagination: { total, limit, offset } }
    // Tolerate the older `{ requests: [...] }` shape for safety.
    const requests: Request[] = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.requests)
        ? body.requests
        : [];
    return requests;
  } catch (error) {
    console.error("Error fetching requests:", error);
    return [];
  }
};
