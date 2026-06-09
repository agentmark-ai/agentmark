import { ReactNode } from "react";
import { useTraceDrawerContext } from "../trace-drawer-provider";
import { SessionIoOverview } from "./session-io-overview";

/**
 * Chooses what the details panel shows in a session view: the all-traces
 * `SessionIoOverview` while no specific span is drilled into, or `children`
 * (the single-span detail) once a non-root span is selected. Outside a session
 * view it always renders `children`.
 *
 * The decision lives on the drawer context (`showSessionOverview`) because the
 * provider holds its inputs — sessionId, the trace set, and the authoritative
 * selectedSpanId — so the host stays a thin renderer.
 */
export const SessionDetailsSwitch = ({ children }: { children: ReactNode }) => {
  const { showSessionOverview } = useTraceDrawerContext();
  return showSessionOverview ? <SessionIoOverview /> : <>{children}</>;
};
