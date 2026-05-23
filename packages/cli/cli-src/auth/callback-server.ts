import http from "http";
import { CallbackResult } from "./types";

/**
 * Default time the local callback server waits for the browser handoff
 * before giving up. Bumped from 30s to 2 minutes for the agent-driven
 * flow where the user reads a prompt, switches to a browser, clicks a
 * URL, and completes sign-in — that round-trip routinely exceeds 30s.
 * Override per-call via the `timeoutMs` argument to `startCallbackServer`.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><body><h1>Authentication successful!</h1><p>You can close this tab.</p></body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><body><h1>Authentication failed</h1><p>Invalid state parameter.</p></body></html>`;

/**
 * Starts a localhost HTTP server on a random available port that listens for
 * the OAuth callback. Returns the assigned port, a promise-based
 * `waitForCallback()` to await the authorization code, and a `close()` method
 * for manual cleanup.
 *
 * `timeoutMs` caps how long the server waits for the browser handoff before
 * rejecting `waitForCallback()` with `Login timed out`. Defaults to
 * {@link DEFAULT_TIMEOUT_MS} (2 minutes). Pass an explicit value to override
 * (e.g. `agentmark login --timeout 300` for a 5-minute window).
 */
export function startCallbackServer(
  expectedState: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{
  port: number;
  waitForCallback: () => Promise<CallbackResult>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let callbackResolve: ((result: CallbackResult) => void) | null = null;
    let callbackReject: ((error: Error) => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const callbackPromise = new Promise<CallbackResult>((res, rej) => {
      callbackResolve = res;
      callbackReject = rej;
    });

    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      if (!req.url) {
        res.writeHead(400);
        res.end();
        return;
      }

      const parsed = new URL(req.url, `http://localhost`);

      if (req.method !== "GET" || parsed.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const access_token = parsed.searchParams.get("access_token");
      const refresh_token = parsed.searchParams.get("refresh_token");
      const user_id = parsed.searchParams.get("user_id");
      const email = parsed.searchParams.get("email");
      const expires_at = parsed.searchParams.get("expires_at");
      const state = parsed.searchParams.get("state");

      if (!access_token || !refresh_token || !user_id || !email || !expires_at || !state || state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      callbackResolve?.({ access_token, refresh_token, user_id, email, expires_at, state });
      closeServer();
    });

    function closeServer(): void {
      try {
        server.close();
      } catch {
        // Already closed — ignore.
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    server.on("error", (err: Error) => {
      if (!settled) {
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        callbackReject?.(err);
      }
      reject(err);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        closeServer();
        reject(new Error("Failed to get server address"));
        return;
      }

      timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          callbackReject?.(new Error("Login timed out"));
          closeServer();
        }
      }, timeoutMs);

      resolve({
        port: addr.port,
        waitForCallback: () => callbackPromise,
        close: closeServer,
      });
    });
  });
}
