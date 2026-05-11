/**
 * Local score-configs handlers.
 *
 * The OSS CLI's local dev server reads score configs directly from the
 * project's `agentmark.json` (the git-native source of truth). Cloud syncs
 * the same `scores` object map to `puzzlet_config.config.scores` on deploy
 * — both surfaces project the JSON through the same `ScoreConfig` shape so
 * a client moving between `agentmark dev` and the cloud gateway sees an
 * identical body.
 *
 * Read-only by design — to add or modify a config, edit `agentmark.json`
 * and (for cloud) redeploy.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { findProjectRoot } from "../../../config";

const LOCAL_APP_ID = "local";

type RawCategory = { label: string; value: number };

type RawScoreEntry = {
  type?: "boolean" | "numeric" | "categorical" | string;
  description?: unknown;
  min?: unknown;
  max?: unknown;
  categories?: unknown;
};

export type ScoreConfig =
  | {
      id: string;
      name: string;
      commit_sha: string;
      data_type: "boolean";
      description?: string;
    }
  | {
      id: string;
      name: string;
      commit_sha: string;
      data_type: "numeric";
      description?: string;
      min?: number;
      max?: number;
    }
  | {
      id: string;
      name: string;
      commit_sha: string;
      data_type: "categorical";
      description?: string;
      categories: RawCategory[];
    };

function projectScoreConfig(
  name: string,
  commitSha: string,
  raw: RawScoreEntry,
): ScoreConfig | null {
  if (typeof name !== "string" || name.length === 0) return null;
  const id = `${LOCAL_APP_ID}:${name}`;
  const description =
    typeof raw.description === "string" ? raw.description : undefined;

  if (raw.type === "boolean") {
    return {
      id,
      name,
      commit_sha: commitSha,
      data_type: "boolean",
      ...(description !== undefined ? { description } : {}),
    };
  }

  if (raw.type === "numeric") {
    const min =
      typeof raw.min === "number" && Number.isFinite(raw.min) ? raw.min : undefined;
    const max =
      typeof raw.max === "number" && Number.isFinite(raw.max) ? raw.max : undefined;
    return {
      id,
      name,
      commit_sha: commitSha,
      data_type: "numeric",
      ...(description !== undefined ? { description } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    };
  }

  if (raw.type === "categorical") {
    if (!Array.isArray(raw.categories) || raw.categories.length === 0) return null;
    const categories: RawCategory[] = [];
    for (const c of raw.categories) {
      if (
        c &&
        typeof c === "object" &&
        typeof (c as RawCategory).label === "string" &&
        (c as RawCategory).label.length > 0 &&
        typeof (c as RawCategory).value === "number" &&
        Number.isFinite((c as RawCategory).value)
      ) {
        categories.push({
          label: (c as RawCategory).label,
          value: (c as RawCategory).value,
        });
      }
    }
    if (categories.length === 0) return null;
    return {
      id,
      name,
      commit_sha: commitSha,
      data_type: "categorical",
      ...(description !== undefined ? { description } : {}),
      categories,
    };
  }

  return null;
}

/**
 * Read every score config from the project's `agentmark.json` `scores`
 * object map. Returns an empty array (NOT an error) when the file is
 * missing or the `scores` key is absent / malformed — score configs are
 * optional, mirroring the cloud handler's "empty page, not 404" semantics.
 */
export async function readAllScoreConfigs(cwd: string): Promise<ScoreConfig[]> {
  let projectRoot: string;
  try {
    projectRoot = findProjectRoot(cwd);
  } catch {
    return [];
  }

  const configPath = path.join(projectRoot, "agentmark.json");
  if (!fs.existsSync(configPath)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const scores = (parsed as { scores?: unknown }).scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return [];

  let commitSha = "";
  try {
    commitSha =
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || "";
  } catch {
    // best-effort — local config still works outside git repos
  }

  const out: ScoreConfig[] = [];
  for (const [name, entry] of Object.entries(scores as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const projected = projectScoreConfig(name, commitSha, entry as RawScoreEntry);
    if (projected) out.push(projected);
  }
  // Stable ordering — matches cloud handler.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
