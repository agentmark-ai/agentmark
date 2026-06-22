/**
 * Shared AgentMark project-layout helpers: project-language detection,
 * `agentmark.json` reading, prompts-directory resolution, prompt-file
 * discovery, and frontmatter parsing.
 *
 * These were previously duplicated across `dev.ts`, `build.ts`,
 * `generate-schema.ts`, `pull-models.ts`, and `doctor.ts`. Centralizing them
 * keeps one definition (and one error message) per concern, so `agentmark
 * doctor` validates exactly what the other commands act on.
 */

import path from "path";
import fs from "fs-extra";
import { parse as parseYaml } from "yaml";

export type ProjectLanguage = "typescript" | "python";

/**
 * Detect whether a project is Python or TypeScript from filesystem markers.
 * (Moved verbatim from `dev.ts` so `dev` and `doctor` agree.)
 *
 * Explicit AgentMark setup files win over ecosystem manifests: a stray
 * `requirements.txt` in a TS repo (or a `pyproject.toml` in a polyglot one)
 * must not flip an already-set-up project's language. Ecosystem manifests
 * matter for FIRST contact — before any client file exists, a
 * requirements.txt-only project must still get Python guidance from
 * `doctor`/`dev`, not "agentmark.client.ts missing".
 */
export function detectProjectLanguage(cwd: string): ProjectLanguage {
  if (
    fs.existsSync(path.join(cwd, "agentmark_client.py")) ||
    fs.existsSync(path.join(cwd, ".agentmark", "dev_server.py")) ||
    fs.existsSync(path.join(cwd, "dev_server.py"))
  ) {
    return "python";
  }
  if (fs.existsSync(path.join(cwd, "agentmark.client.ts"))) {
    return "typescript";
  }
  if (
    fs.existsSync(path.join(cwd, "pyproject.toml")) ||
    fs.existsSync(path.join(cwd, "requirements.txt")) ||
    fs.existsSync(path.join(cwd, "setup.py"))
  ) {
    return "python";
  }
  return "typescript";
}

export const AGENTMARK_CONFIG_FILE = "agentmark.json";

/**
 * Canonical "no project here" message. Previously three commands disagreed:
 * `build` said "...not found in current directory. Run this command from your
 * AgentMark project root.", while `generate-schema` / `pull-models` pointed at
 * a non-existent `agentmark init`. This is the single source of truth.
 */
export const AGENTMARK_CONFIG_NOT_FOUND =
  "agentmark.json not found in current directory. Run this command from your AgentMark project root, or run `npm create agentmark` to scaffold one.";

export interface AgentmarkConfig {
  agentmarkPath?: string;
  version?: string;
  mdxVersion?: string;
  builtInModels?: string[];
  [key: string]: unknown;
}

export function agentmarkConfigPath(cwd: string): string {
  return path.join(cwd, AGENTMARK_CONFIG_FILE);
}

export interface ReadConfigResult {
  exists: boolean;
  config: AgentmarkConfig | null;
  /** Set when the file exists but isn't valid JSON / isn't an object. */
  parseError?: string;
}

/**
 * Read `agentmark.json` without throwing. This is the shape `doctor` needs so it can
 * report rather than abort.
 */
export function readAgentmarkConfig(cwd: string): ReadConfigResult {
  const file = agentmarkConfigPath(cwd);
  if (!fs.existsSync(file)) {
    return { exists: false, config: null };
  }
  try {
    const parsed = fs.readJsonSync(file) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { exists: true, config: null, parseError: "agentmark.json is not a JSON object" };
    }
    return { exists: true, config: parsed as AgentmarkConfig };
  } catch (e) {
    return { exists: true, config: null, parseError: `agentmark.json is not valid JSON: ${(e as Error).message}` };
  }
}

/**
 * Read `agentmark.json` or throw the canonical errors. This is the shape the
 * action-taking commands (`build`, `generate-schema`, `pull-models`) need.
 */
export function loadAgentmarkConfig(cwd: string = process.cwd()): AgentmarkConfig {
  const result = readAgentmarkConfig(cwd);
  if (!result.exists) {
    throw new Error(AGENTMARK_CONFIG_NOT_FOUND);
  }
  if (!result.config) {
    throw new Error(result.parseError ?? AGENTMARK_CONFIG_NOT_FOUND);
  }
  return result.config;
}

/**
 * Resolve the directory prompts live in: `<cwd>/<agentmarkPath>/agentmark`.
 * (The `agentmarkPath: "/"` footgun resolves to the filesystem root here, which
 * is exactly why `doctor` and `build` both surface it.)
 */
export function promptsDir(cwd: string, config: AgentmarkConfig): string {
  return path.resolve(cwd, config.agentmarkPath || ".", "agentmark");
}

/**
 * True when the project depends on the Vercel AI SDK provider packages
 * (`@ai-sdk/*`) or its core `ai` package. That is the only setup where the
 * `.registerProviders({...})` model-registry hint applies; raw provider SDKs
 * (`openai`, `@anthropic-ai/sdk`, ...) have neither, and their executor owns the
 * model mapping. Best-effort: a missing/unreadable package.json reads as false.
 */
export function projectUsesAiSdk(cwd: string): boolean {
  try {
    const pkg = fs.readJsonSync(path.join(cwd, "package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    return Object.keys(deps).some((d) => d === "ai" || d.startsWith("@ai-sdk/"));
  } catch {
    return false;
  }
}

/** Recursively collect files matching `pattern`, skipping `node_modules`. */
export async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

const PROMPT_FILE_PATTERN = /\.prompt\.mdx$/;

/** All `*.prompt.mdx` files under `dir` (absolute paths). */
export function findPromptFiles(dir: string): Promise<string[]> {
  return findFiles(dir, PROMPT_FILE_PATTERN);
}

export type PromptKind = "text" | "object" | "image" | "speech";

/**
 * Determine the prompt kind from its frontmatter's `*_config` block.
 * (Moved from `build.ts`; throws the same message it always has.)
 */
export function determinePromptKind(frontmatter: Record<string, unknown>): PromptKind {
  if (frontmatter.text_config) return "text";
  if (frontmatter.object_config) return "object";
  if (frontmatter.image_config) return "image";
  if (frontmatter.speech_config) return "speech";
  throw new Error(
    "Could not determine prompt kind: frontmatter needs a *_config block " +
    "(text_config, object_config, image_config, or speech_config). The model " +
    "goes inside it, e.g. `text_config:` with `model_name: <provider/model>` " +
    "(not at the top level, and not under a `metadata`/`model` key)."
  );
}

export type FrontmatterResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

/** Parse a prompt file's leading `---` YAML frontmatter block. */
export function readFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { ok: false, error: "no frontmatter block" };
  try {
    const data = parseYaml(match[1]) ?? {};
    if (typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "frontmatter is not a mapping" };
    }
    return { ok: true, data: data as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: `invalid YAML frontmatter (${(e as Error).message})` };
  }
}

/** Top-level keys the agentmark.json schema allows (it is additionalProperties: false). */
export const KNOWN_CONFIG_KEYS = [
  "$schema",
  "version",
  "mdxVersion",
  "agentmarkPath",
  "handler",
  "builtInModels",
  "modelSchemas",
  "mcpServers",
  "evals",
  "scores",
];

/** Top-level keys the schema marks required. */
export const REQUIRED_CONFIG_KEYS = ["version", "agentmarkPath"];

export interface ConfigShapeIssues {
  missingRequired: string[];
  unknownKeys: string[];
}

/**
 * Check agentmark.json against the bundled schema's shape: required keys
 * present, and no unknown top-level keys (the schema is additionalProperties:
 * false, so a typo such as `buildInModels` is otherwise silently ignored).
 */
export function validateConfigShape(config: AgentmarkConfig): ConfigShapeIssues {
  const known = new Set(KNOWN_CONFIG_KEYS);
  return {
    missingRequired: REQUIRED_CONFIG_KEYS.filter((key) => !(key in config)),
    unknownKeys: Object.keys(config).filter((key) => !known.has(key)),
  };
}
