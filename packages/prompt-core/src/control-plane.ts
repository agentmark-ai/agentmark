/**
 * Shared control-plane contract for AgentMark webhook adapters.
 *
 * Control-plane webhook jobs (currently `get-evals`) answer the dashboard's
 * questions *about* a deployed app — e.g. "which evals can I run in a new
 * experiment?" — rather than executing a prompt. The logic lives here once,
 * sourced from the AgentMark client (the eval-registry owner), so every adapter
 * — built-in or customer-authored — answers identically and never reimplements
 * it. The shared webhook dispatch depends on the `ControlPlaneClient`
 * abstraction, not on any concrete adapter (DIP).
 *
 * This is the TypeScript half of a cross-language contract. The Python half
 * lives in `agentmark.prompt_core` (`control_plane.py`). Keep the two in
 * lock-step:
 *
 *  - `ControlPlaneClient.getEvalNames()` ⇔ `ControlPlaneClient.get_eval_names()`
 *  - `buildEvalsResponse()` ⇔ `build_evals_response()`
 *  - the wire shape `{ type: "evals", result: <json string>, traceId: "" }` is
 *    byte-for-byte identical in both languages.
 */

/**
 * Client capability the control-plane dispatch depends on. `AgentMark`
 * implements this. A custom client only needs `getEvalNames()` to participate
 * in the `get-evals` webhook job.
 */
export interface ControlPlaneClient {
  getEvalNames(): string[];
}

/** Wire payload for the `get-evals` webhook job. */
export interface EvalsResponse {
  type: "evals";
  result: string;
  traceId: string;
}

/**
 * Build the `get-evals` wire payload from the client. Single source of truth
 * for the shape the dashboard's evals route parses.
 *
 * Names are sorted so the order is deterministic and identical across
 * languages — never relying on registry/insertion order, which `Object.keys`
 * reorders for integer-like keys (`"10"` before `"a"`). `JSON.stringify` is
 * already compact and emits raw UTF-8; Python's helper matches it
 * (`separators=(",",":")`, `ensure_ascii=False`). Both invariants are pinned by
 * the shared `conformance-vectors/control-plane.json` golden cases.
 */
export function buildEvalsResponse(client: ControlPlaneClient): EvalsResponse {
  const names = [...client.getEvalNames()].sort();
  return {
    type: "evals",
    result: JSON.stringify(names),
    traceId: "",
  };
}
