import fs from "fs-extra";
import os from "os";
import path from "path";
import prompts from "prompts";
import { writeMcpConfig, type McpClient } from "./mcp-config";
import { installAgentmarkSkill } from "./install-skill";
import { initGitRepo } from "./git-init";
import { detectProjectInfo, isCurrentDirectory } from "./project-detection";
import { pinCliInPackageJson } from "./pin-cli";

/**
 * `agentmark init` — minimal project setup.
 *
 * Scope is deliberately small. It does NOT scaffold example code, pick an
 * LLM adapter, or handle login. Its job is:
 *
 *   1. Write `agentmark.json` (the SDK loader's config root)
 *   2. Create an empty `agentmark/` directory (where prompts go)
 *   3. Pin `@agentmark-ai/cli` as a local dev dependency + npm scripts so
 *      CI and teammates use the same CLI version without a global install
 *   4. Wire MCP configs for any IDE clients the user selects
 *   5. Install the AgentMark agent skill (`npx skills add agentmark-ai/skills`)
 *   6. Hand off to the AI tool: "Open Claude Code / Cursor and say:
 *      Set up AgentMark in this project."
 *
 * Everything else — framework detection, package install, code wiring,
 * first prompt — is the job of the `setup-and-integration` skill workflow,
 * which runs inside the user's IDE agent. That keeps integration adaptive
 * to whatever stack the user already has, instead of forcing a template.
 *
 * This is the same logic `npm create agentmark` runs; that command is now a
 * thin wrapper that invokes `agentmark init`.
 */

export interface InitArgs {
  path?: string;
  clients?: McpClient[];
  /**
   * Undocumented escape hatch for internal staging
   * (`https://api-stg.agentmark.co`) and rare self-hosters. Defaults to
   * `https://api.agentmark.co`. The `agentmark-local` MCP entry always
   * points at `http://localhost:9418` regardless of this flag.
   */
  apiUrl?: string;
  overwrite?: boolean;
  /**
   * Non-interactive mode for CI and coding agents: every prompt is replaced
   * by its default (target folder per `defaultFolderName`, all IDE clients,
   * keep an existing agentmark.json). Headless onboarding depends on this —
   * without it the init blocks on a TTY no agent has.
   */
  yes?: boolean;
  /**
   * Bare version of the running CLI (e.g. "0.15.0"), pinned as a caret
   * range into the user's package.json devDependencies.
   */
  cliVersion: string;
}

export const ALL_CLIENTS: readonly McpClient[] = ["claude-code", "codex", "cursor", "vscode", "zed"];

export const AGENTMARK_JSON: Record<string, unknown> = {
  $schema:
    "https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/agentmark.schema.json",
  version: "2.0.0",
  mdxVersion: "1.0",
  agentmarkPath: ".",
  // Seed one model so the dashboard prompt editor isn't an empty dropdown on
  // first run. Add more with `agentmark pull-models` (writes provider/model
  // entries here) — see https://docs.agentmark.co/configure/model-schemas.
  builtInModels: ["openai/gpt-5.5"],
};

export const clientLabel = (id: string): string =>
  id === "vscode" ? "VS Code"
    : id === "zed" ? "Zed"
      : id === "cursor" ? "Cursor"
        : id === "claude-code" ? "Claude Code"
          : id === "codex" ? "Codex"
            : id;

/**
 * The folder the interactive prompt would offer as its default: "." when
 * cwd looks like an existing project (the common "wire AgentMark into my
 * repo" case), a fresh folder name when cwd is empty (greenfield). `--yes`
 * resolves to exactly this value, so a non-interactive run lands where an
 * Enter-mashing interactive run would have.
 */
export const defaultFolderName = (cwd: string = process.cwd()): string =>
  fs.existsSync(path.join(cwd, "package.json")) ||
  fs.existsSync(path.join(cwd, "pyproject.toml"))
    ? "."
    : "my-agentmark-app";

/**
 * Resolves the target folder via positional/flag arg, `--yes` default, or
 * interactive prompt.
 */
export const resolveTargetPath = async (
  cliPath: string | undefined,
  yes?: boolean,
): Promise<{ targetPath: string; isCurrentDir: boolean } | null> => {
  let folderName = cliPath;
  if (!folderName && yes) {
    folderName = defaultFolderName();
  }
  if (!folderName) {
    const response = await prompts({
      name: "folderName",
      type: "text",
      message: "Where would you like to set up AgentMark?",
      initial: defaultFolderName(),
    });
    folderName = response.folderName;
  }
  if (!folderName) return null; // Ctrl+C / empty input

  const isCurrentDir = isCurrentDirectory(folderName);
  const targetPath = isCurrentDir ? process.cwd() : path.resolve(folderName);
  if (!isCurrentDir) fs.ensureDirSync(targetPath);
  return { targetPath, isCurrentDir };
};

/**
 * Detects which IDE clients the user has installed or is actively running.
 *
 * Detection order (matches the vercel-labs/skills CLI approach):
 *   1. Home dir — which editors are *installed* (`~/.claude`, `~/.cursor`,
 *      Zed config dir). Most reliable; works for greenfield projects too.
 *   2. Env vars — detect the *current* editor session. VS Code has no
 *      canonical home-dir marker, so env vars are the right signal for it.
 *      Cursor-specific vars are checked before VS Code vars because Cursor
 *      inherits `VSCODE_PID`/`TERM_PROGRAM=vscode`.
 *   3. Project dir — already-wired editors in this specific repo (fallback
 *      when steps 1–2 return nothing, e.g. in a fully offline environment
 *      with a pre-existing project).
 *
 * Returns an empty array when nothing can be inferred — callers treat that
 * as "no default; let the user choose explicitly."
 *
 * `homedir` is injectable for tests (defaults to `os.homedir()`).
 */
export const detectCurrentClients = (
  targetPath: string,
  homedir: string = os.homedir(),
): McpClient[] => {
  const detected = new Set<McpClient>();

  // 1. Home dir: editors with a known config location
  if (fs.existsSync(path.join(homedir, ".claude"))) detected.add("claude-code");
  if (fs.existsSync(path.join(homedir, ".codex"))) detected.add("codex");
  if (fs.existsSync(path.join(homedir, ".cursor"))) detected.add("cursor");
  // Zed uses platform-specific config dirs; check the two common ones
  if (
    fs.existsSync(path.join(homedir, ".config", "zed")) ||
    fs.existsSync(path.join(homedir, "Library", "Application Support", "zed"))
  ) detected.add("zed");

  // 2. Env vars: detect active editor session (VS Code has no home-dir marker)
  if (process.env["CURSOR_TRACE_ID"] ?? process.env["CURSOR_CHANNEL"]) {
    detected.add("cursor");
  } else if (process.env["VSCODE_PID"] ?? process.env["TERM_PROGRAM"] === "vscode") {
    detected.add("vscode");
  }

  if (detected.size > 0) return [...detected];

  // 3. Project dir fallback: editors already wired in this repo
  if (fs.existsSync(path.join(targetPath, ".vscode"))) detected.add("vscode");
  if (fs.existsSync(path.join(targetPath, ".codex"))) detected.add("codex");
  if (fs.existsSync(path.join(targetPath, ".cursor"))) detected.add("cursor");
  if (fs.existsSync(path.join(targetPath, ".zed"))) detected.add("zed");
  if (
    fs.existsSync(path.join(targetPath, ".mcp.json")) ||
    fs.existsSync(path.join(targetPath, ".claude"))
  ) detected.add("claude-code");

  return [...detected];
};

/**
 * Resolves which IDE clients to wire MCP into. The prompt pre-selects
 * clients already detected in the project (or the running editor via env
 * vars); if nothing is detected the list starts with nothing selected so
 * the user makes an explicit choice. Empty selection skips MCP wiring
 * entirely.
 */
export const resolveClients = async (
  cliClients: McpClient[] | undefined,
  yes?: boolean,
  targetPath?: string,
): Promise<McpClient[]> => {
  if (cliClients && cliClients.length > 0) {
    for (const c of cliClients) {
      if (!ALL_CLIENTS.includes(c)) {
        throw new Error(`Invalid client "${c}". Valid: ${ALL_CLIENTS.join(", ")}`);
      }
    }
    return cliClients;
  }
  // --yes is the non-interactive/CI/agent path: wire everything so headless
  // onboarding never silently skips an editor the agent expects to use.
  if (yes) return [...ALL_CLIENTS];
  const defaultSelected = targetPath ? detectCurrentClients(targetPath) : [];
  const response = await prompts({
    name: "clients",
    type: "multiselect",
    message: "Wire AgentMark MCP into which IDE clients?",
    instructions: false,
    hint: "Space to toggle. Enter to submit. Skip all = empty selection.",
    choices: ALL_CLIENTS.map((id) => ({
      title: clientLabel(id),
      value: id,
      selected: defaultSelected.includes(id),
    })),
  });
  return (response.clients ?? []) as McpClient[];
};

/**
 * agentmark.json is the only file we conflict on (the others — MCP config
 * dirs, agentmark/, .gitkeep — are either additive or no-ops if present).
 * Default to "skip" so we never silently clobber an existing project's
 * config; `--overwrite` is the explicit opt-in for re-init scripts.
 */
export const shouldWriteAgentmarkJson = async (
  filePath: string,
  overwrite: boolean | undefined,
  yes?: boolean,
): Promise<boolean> => {
  if (!fs.existsSync(filePath)) return true;
  if (overwrite) return true;
  // --yes takes the safe interactive default: keep the existing file.
  // Clobbering config is never a default; --overwrite is the explicit opt-in.
  if (yes) return false;
  const { action } = await prompts({
    type: "select",
    name: "action",
    message: "agentmark.json already exists. What would you like to do?",
    choices: [
      { title: "Skip (keep existing)", value: "skip" },
      { title: "Overwrite with default config", value: "overwrite" },
    ],
    initial: 0,
  });
  return action === "overwrite";
};

/**
 * Runs the init flow. Pure-ish: all interactivity flows through `prompts`
 * (mockable) and the only side effects are filesystem writes under the
 * resolved target path. The commander wiring in `index.ts` maps CLI flags
 * to `InitArgs` and supplies `cliVersion`.
 */
const runInit = async (args: InitArgs): Promise<void> => {
  const target = await resolveTargetPath(args.path, args.yes);
  if (!target) {
    console.log("Aborted.");
    return;
  }
  const { targetPath } = target;

  const projectInfo = detectProjectInfo(targetPath);
  const clients = await resolveClients(args.clients, args.yes, targetPath);

  console.log("");

  // 1. agentmark.json — the SDK loader's config root
  const agentmarkJsonPath = path.join(targetPath, "agentmark.json");
  if (await shouldWriteAgentmarkJson(agentmarkJsonPath, args.overwrite, args.yes)) {
    fs.writeJsonSync(agentmarkJsonPath, AGENTMARK_JSON, { spaces: 2 });
    console.log("✅ agentmark.json");
  } else {
    console.log("⏭️  agentmark.json (kept existing)");
  }

  // 2. agentmark/ — where prompts go. Empty + .gitkeep so the folder is
  //    discoverable and version-controlled before the user adds anything.
  //    Matches agentmarkPath: "." in agentmark.json.
  const agentmarkDirPath = path.join(targetPath, "agentmark");
  if (!fs.existsSync(agentmarkDirPath)) {
    fs.ensureDirSync(agentmarkDirPath);
    fs.writeFileSync(path.join(agentmarkDirPath, ".gitkeep"), "");
    console.log("✅ agentmark/ (empty, ready for your .prompt.mdx files)");
  } else {
    console.log("⏭️  agentmark/ (kept existing)");
  }

  // 3. Pin @agentmark-ai/cli locally + add npm scripts so CI and teammates
  //    use the same CLI version without a global install. No-op when the
  //    target has no package.json (greenfield).
  const pin = pinCliInPackageJson(targetPath, args.cliVersion);
  if (pin?.addedDevDependency) {
    console.log(`✅ package.json (@agentmark-ai/cli ${pin.cliVersionRange} + scripts: ${pin.addedScripts.join(", ") || "none"})`);
    console.log("   Run your package manager's install to fetch the pinned CLI (e.g. npm install).");
  } else if (pin && pin.addedScripts.length > 0) {
    console.log(`✅ package.json (scripts: ${pin.addedScripts.join(", ")})`);
  }

  // 4. MCP wiring — one config file per selected IDE client
  for (const client of clients) {
    try {
      const result = writeMcpConfig(client, targetPath, { customApiUrl: args.apiUrl });
      if (result) {
        const rel = path.relative(targetPath, result.configPath) || result.configPath;
        console.log(`✅ MCP wired (${clientLabel(client)}): ${rel}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  Could not write MCP config for ${clientLabel(client)}: ${message}`);
    }
  }

  // 5. AgentMark agent skill (best-effort; logs its own status)
  installAgentmarkSkill(targetPath);

  // 6. git init — only if this is a greenfield folder
  if (!projectInfo.isExistingProject) {
    initGitRepo(targetPath);
  }

  // 7. Handoff to the AI tool. The integration logic lives in the skill
  //    workflow (`setup-and-integration.md`), not here, so the rest of
  //    onboarding adapts to whatever stack the user already has.
  console.log("");
  console.log("✨ AgentMark is wired up.");
  console.log("");
  console.log("   Next: open this project in Claude Code, Cursor, VS Code, or Zed and say:");
  console.log("");
  console.log("       \"Set up AgentMark in this project.\"");
  console.log("");
  console.log("   The AgentMark skill will detect your stack, propose the wiring against");
  console.log("   the docs MCP (https://docs.agentmark.co/mcp), and integrate adaptively.");
};

export default runInit;
