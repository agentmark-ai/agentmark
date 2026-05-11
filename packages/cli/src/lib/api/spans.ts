import type { SpanIOData } from "@agentmark-ai/ui-components";
import { API_URL } from "../../config/api";

/**
 * Fetch the per-span Input/Output payload from the local CLI dev server.
 *
 * The list/detail trace endpoints deliberately omit per-span input/output
 * (they're heavy and most consumers don't need them up-front). The
 * `/v1/traces/:traceId/spans/:spanId` endpoint returns the IO blob on
 * demand, which the InputOutputTab then renders via `mergeSpanIO`.
 *
 * Wire shape:  `{ data: { input, output, output_object, tool_calls } }`
 * Consumer:    `{ input, output, outputObject, toolCalls }`
 *
 * Snake-case → camelCase translation happens here at the boundary so
 * the renderer never has to know which case style a given field uses.
 * Mirrors the consumer-envelope pattern from commit c34201f62.
 */
export const getSpanIO = async (
  traceId: string,
  spanId: string,
): Promise<SpanIOData | null> => {
  try {
    const response = await fetch(
      `${API_URL}/v1/traces/${encodeURIComponent(traceId)}/spans/${encodeURIComponent(spanId)}`,
    );
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch span IO: ${response.statusText}`);
    }
    const body = await response.json();
    // Canonical wire shape:
    //   { data: { input, output, output_object, tool_calls } }
    // Tolerate legacy unwrapped or `.span_io`-keyed responses so any older
    // mock fixture keeps working.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wire: any = body?.data ?? body?.span_io ?? body;
    if (!wire || typeof wire !== "object") return null;
    return {
      input: typeof wire.input === "string" ? wire.input : "",
      output: typeof wire.output === "string" ? wire.output : "",
      // Wire emits snake_case; consumer expects camelCase.
      outputObject:
        typeof wire.output_object === "string"
          ? wire.output_object
          : typeof wire.outputObject === "string"
            ? wire.outputObject
            : null,
      toolCalls:
        typeof wire.tool_calls === "string"
          ? wire.tool_calls
          : typeof wire.toolCalls === "string"
            ? wire.toolCalls
            : null,
    };
  } catch (error) {
    console.error("Error fetching span IO:", error);
    return null;
  }
};
