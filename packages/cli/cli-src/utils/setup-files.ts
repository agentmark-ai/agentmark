/**
 * Shared resolution + error messaging for the files the "Set up AgentMark"
 * editor skill writes: the client (`agentmark.client.ts` / `agentmark_client.py`),
 * the dev-server entry, and the managed-deploy handler. `dev` acts on the first
 * two (and aborts when missing); `doctor` reports on all three. Both import from
 * here so the guidance is identical, byte-for-byte, in either place.
 */

import path from "path";
import fs from "fs";
import type { ProjectLanguage } from "./project";

const CLIENT_SETUP_HINT =
  'ask your coding agent to "Set up AgentMark in this project," or follow https://docs.agentmark.co/getting-started/client-setup.';

export function clientFileName(language: ProjectLanguage): string {
  return language === "python" ? "agentmark_client.py" : "agentmark.client.ts";
}

export function clientFilePresent(cwd: string, language: ProjectLanguage): boolean {
  return fs.existsSync(path.join(cwd, clientFileName(language)));
}

/**
 * The lines `dev` prints (and the guidance `doctor` shows) when the client
 * file is missing. Line 0 is the headline; the rest is remediation.
 */
export function clientNotFoundMessages(language: ProjectLanguage): string[] {
  const root = language === "python" ? "AgentMark Python project root" : "AgentMark project root";
  return [
    `Error: ${clientFileName(language)} not found in current directory.`,
    `Run \`agentmark dev\` from your ${root}. If the client is not set up yet, ${CLIENT_SETUP_HINT}`,
  ];
}

export type DevEntryKind = "custom" | "default" | "legacy";

export interface DevEntryResolution {
  exists: boolean;
  /** Absolute path to the entry that will be used (when `exists`). */
  path?: string;
  kind?: DevEntryKind;
}

/**
 * Resolve the dev-server entry in the same priority order `dev` uses:
 *   TypeScript: `dev-server.ts` (custom) → `dev-entry.ts` (default) → `.agentmark/dev-entry.ts` (legacy)
 *   Python:     `dev_server.py` (custom) → `.agentmark/dev_server.py` (default)
 */
export function resolveDevEntry(cwd: string, language: ProjectLanguage): DevEntryResolution {
  const candidates: Array<{ kind: DevEntryKind; path: string }> =
    language === "python"
      ? [
          { kind: "custom", path: path.join(cwd, "dev_server.py") },
          { kind: "default", path: path.join(cwd, ".agentmark", "dev_server.py") },
        ]
      : [
          { kind: "custom", path: path.join(cwd, "dev-server.ts") },
          { kind: "default", path: path.join(cwd, "dev-entry.ts") },
          { kind: "legacy", path: path.join(cwd, ".agentmark", "dev-entry.ts") },
        ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.path)) {
      return { exists: true, path: candidate.path, kind: candidate.kind };
    }
  }
  return { exists: false };
}

/**
 * The lines `dev` prints (and the guidance `doctor` shows) when no dev-server
 * entry exists.
 */
export function devEntryNotFoundMessages(language: ProjectLanguage): string[] {
  const expected =
    language === "python"
      ? "Expected .agentmark/dev_server.py (or dev_server.py at your project root)."
      : "Expected dev-entry.ts at your project root (or .agentmark/dev-entry.ts).";
  return [
    language === "python"
      ? "Error: No Python dev server entry point found."
      : "Error: No dev server entry point found.",
    expected,
    `This file is created when you set up the AgentMark client. To create it, ${CLIENT_SETUP_HINT}`,
  ];
}

export interface HandlerResolution {
  /** True when a handler file could be located. */
  exists: boolean;
  /** Absolute path to the resolved handler (set when `exists`). */
  path?: string;
  /** True when resolution came from an explicit `config.handler` pointer. */
  fromConfig: boolean;
}

/**
 * Resolve the managed-deployment handler the same way AgentMark Cloud's
 * pipeline does: an explicit `config.handler` path if set, else `handler.py`,
 * else `handler.ts` at the project root. (The Cloud lookup is language-agnostic;
 * the file extension picks the runtime, so the py-before-ts order is fixed.)
 *
 * `doctor` reads `fromConfig` to tell two failures apart: a configured path that
 * does not resolve (a definite bug, since the project opted into deployment)
 * versus simply having no handler yet (a nudge, since managed deploy is opt-in).
 */
export function resolveHandler(cwd: string, configuredHandler?: string): HandlerResolution {
  if (typeof configuredHandler === "string" && configuredHandler.trim().length > 0) {
    const abs = path.isAbsolute(configuredHandler) ? configuredHandler : path.join(cwd, configuredHandler);
    return { exists: fs.existsSync(abs), path: fs.existsSync(abs) ? abs : undefined, fromConfig: true };
  }
  for (const name of ["handler.py", "handler.ts"]) {
    const abs = path.join(cwd, name);
    if (fs.existsSync(abs)) return { exists: true, path: abs, fromConfig: false };
  }
  return { exists: false, fromConfig: false };
}
