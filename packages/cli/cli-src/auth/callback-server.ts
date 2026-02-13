import http from "http";
import { CallbackResult } from "./types";

const TIMEOUT_MS = 30_000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><body><h1>Authentication successful!</h1><p>You can close this tab.</p></body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><body><h1>Authentication failed</h1><p>Invalid state parameter.</p></body></html>`;

/**
 * Starts a localhost HTTP server on a random available port that listens for
 * the OAuth callback. Returns the assigned port, a promise-based
 * `waitForCallback()` to await the authorization code, and a `close()` method
 * for manual cleanup.
 */
export function startCallbackServer(expectedState: string): Promise<{
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
      }, TIMEOUT_MS);

      resolve({
        port: addr.port,
        waitForCallback: () => callbackPromise,
        close: closeServer,
      });
    });
  });
}
