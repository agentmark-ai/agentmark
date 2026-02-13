import fs from "fs";
import path from "path";
import os from "os";
import { CliAuthCredentials } from "./types";

/**
 * Returns the directory used for storing auth credentials.
 * In test environments, uses a temp directory to avoid polluting the real home.
 */
export function getAuthDir(): string {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return path.join(os.tmpdir(), ".agentmark-test", path.sep);
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
