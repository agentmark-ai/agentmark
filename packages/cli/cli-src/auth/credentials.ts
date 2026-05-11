import fs from "fs";
import path from "path";
import os from "os";
import { CliAuthCredentials } from "./types";

/**
 * Returns the directory used for storing auth credentials.
 * In test environments, uses a per-worker temp dir to avoid both polluting
 * the real home AND cross-file pollution between vitest workers running
 * in parallel. Before this was a single shared dir, `credentials.test.ts`
 * writes leaked into `forwarder.test.ts` via `loadCredentials()`.
 */
export function getAuthDir(): string {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    // VITEST_POOL_ID is set per worker by vitest; pid is a safe fallback
    // for non-vitest "NODE_ENV=test" callers and for the rare case where
    // VITEST_POOL_ID isn't populated (e.g. main thread of the test runner).
    const workerId = process.env.VITEST_POOL_ID || String(process.pid);
    return path.join(os.tmpdir(), `.agentmark-test-${workerId}`, path.sep);
  }
  return path.join(os.homedir(), ".agentmark", path.sep);
}

/**
 * Returns the full path to the auth credentials file.
 */
export function getAuthFilePath(): string {
  return path.join(getAuthDir(), "auth.json");
}

/**
 * Loads credentials from disk. Returns null if the file is missing or contains
 * invalid JSON.
 */
export function loadCredentials(): CliAuthCredentials | null {
  try {
    const filePath = getAuthFilePath();
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CliAuthCredentials;
  } catch {
    return null;
  }
}

/**
 * Persists credentials to disk. Creates the auth directory if it does not
 * exist and restricts file permissions to owner read/write only (0o600).
 */
export function saveCredentials(credentials: CliAuthCredentials): void {
  const dir = getAuthDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = getAuthFilePath();
  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf-8");
  fs.chmodSync(filePath, 0o600);
}

/**
 * Removes the credentials file from disk. Silently ignores the case where the
 * file does not exist.
 */
export function clearCredentials(): void {
  try {
    fs.unlinkSync(getAuthFilePath());
  } catch {
    // File does not exist — nothing to clear.
  }
}

/**
 * Returns true when the credentials have expired based on their `expires_at`
 * ISO 8601 timestamp compared to the current time.
 */
export function isExpired(credentials: CliAuthCredentials): boolean {
  const expiresAt = new Date(credentials.expires_at).getTime();
  return Date.now() >= expiresAt;
}
