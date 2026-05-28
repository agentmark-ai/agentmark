import fs from "fs-extra";
import path from "path";
import prompts from "prompts";
import { pathToFileURL } from "url";
import { writeMcpConfig, type McpClient } from "./utils/examples/mcp-config.js";
import { installAgentmarkSkill } from "./utils/install-skill.js";
import { initGitRepo } from "./utils/git-init.js";
import { detectProjectInfo, isCurrentDirectory } from "./utils/project-detection.js";

/**
 * `npm create agentmark` — minimal init.
 *
 * Scope is deliberately small. The CLI does NOT scaffold example code,
 * pick an LLM adapter, or handle login. Its job is:
 *
 *   1. Write `agentmark.json` (the SDK loader's config root)
 *   2. Create an empty `agentmark/` directory (where prompts go)
 *   3. Wire MCP configs for any IDE clients the user selects
 *   4. Install the AgentMark agent skill (`npx skills add agentmark-ai/skills`)
 *   5. Hand off to the AI tool: "Open Claude Code / Cursor and say:
 *      Set up AgentMark in this project."
 *
 * Everything else — framework detection, package install, code wiring,
 * first prompt — is the job of the `setup-and-integration` skill workflow,
 * which runs inside the user's IDE agent. That keeps integration adaptive
 * to whatever stack the user already has, instead of forcing a template.
 */

export interface CliArgs {
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
}

export const ALL_CLIENTS: readonly McpClient[] = ["claude-code", "cursor", "vscode", "zed"];

export const AGENTMARK_JSON: Record<string, unknown> = {
  $schema:
    "https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/agentmark.schema.json",
  version: "2.0.0",
  mdxVersion: "1.0",
  agentmarkPath: ".",
};

export const parseArgs = (argv: string[] = process.argv.slice(2)): CliArgs => {
  const result: CliArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path") {
      result.path = argv[++i];
    } else if (arg === "--client") {
      const value = argv[++i];
      if (!value) throw new Error("--client requires a value");
      const ids = value === "all"
        ? [...ALL_CLIENTS]
        : value.split(",").map((s) => s.trim()).filter(Boolean) as McpClient[];
      result.clients = [...(result.clients ?? []), ...ids];
    } else if (arg === "--overwrite") {
      result.overwrite = true;
    } else if (arg === "--api-url") {
      const value = argv[++i];
      if (!value || !/^https?:\/\//.test(value)) {
        throw new Error(`--api-url requires a full http(s) URL (got "${value}")`);
      }
      result.apiUrl = value;
    } else if (arg && !arg.startsWith("--") && !result.path) {
      // Positional: folder name, matches `npx create-next-app my-app` shape.
      result.path = arg;
    }
  }

  return result;
};

export const clientLabel = (id: string): string =>
  id === "vscode" ? "VS Code"
    : id === "zed" ? "Zed"
      : id === "cursor" ? "Cursor"
        : id === "claude-code" ? "Claude Code"
          : id;

/**
 * Resolves the target folder via positional/flag arg or interactive prompt.
 * Default to "." when cwd looks like an existing project (the common case
 * for "wire AgentMark into my repo"); fall back to a fresh folder name when
 * cwd is empty (the greenfield case).
 */
export const resolveTargetPath = async (
  cliPath: string | undefined,
): Promise<{ targetPath: string; isCurrentDir: boolean } | null> => {
  let folderName = cliPath;
  if (!folderName) {
    const cwd = process.cwd();
    const cwdHasProject =
      fs.existsSync(path.join(cwd, "package.json")) ||
      fs.existsSync(path.join(cwd, "pyproject.toml"));
    const response = await prompts({
      name: "folderName",
      type: "text",
      message: "Where would you like to set up AgentMark?",
      initial: cwdHasProject ? "." : "my-agentmark-app",
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
 * Resolves which IDE clients to wire MCP into. All 4 are pre-selected on
 * the prompt so the typical "I use everything" case is one keystroke
 * (Enter). Empty selection is equivalent to the old "Skip" option — the
 * caller just writes nothing.
 */
export const resolveClients = async (cliClients: McpClient[] | undefined): Promise<McpClient[]> => {
  if (cliClients && cliClients.length > 0) {
    for (const c of cliClients) {
      if (!ALL_CLIENTS.includes(c)) {
        throw new Error(`Invalid client "${c}". Valid: ${ALL_CLIENTS.join(", ")}`);
      }
    }
    return cliClients;
  }
  const response = await prompts({
    name: "clients",
    type: "multiselect",
    message: "Wire AgentMark MCP into which IDE clients?",
    instructions: false,
    hint: "Space to toggle. Enter to submit. Skip all = empty selection.",
    choices: ALL_CLIENTS.map((id) => ({
      title: clientLabel(id),
      value: id,
      selected: true,
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
): Promise<boolean> => {
  if (!fs.existsSync(filePath)) return true;
  if (overwrite) return true;
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

export const main = async (): Promise<void> => {
  const cliArgs = parseArgs();

  const target = await resolveTargetPath(cliArgs.path);
  if (!target) {
    console.log("Aborted.");
    return;
  }
  const { targetPath } = target;

  const projectInfo = detectProjectInfo(targetPath);
  const clients = await resolveClients(cliArgs.clients);

  console.log("");

  // 1. agentmark.json — the SDK loader's config root
  const agentmarkJsonPath = path.join(targetPath, "agentmark.json");
  if (await shouldWriteAgentmarkJson(agentmarkJsonPath, cliArgs.overwrite)) {
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

  // 3. MCP wiring — one config file per selected IDE client
  for (const client of clients) {
    try {
      const result = writeMcpConfig(client, targetPath, { customApiUrl: cliArgs.apiUrl });
      if (result) {
        const rel = path.relative(targetPath, result.configPath) || result.configPath;
        console.log(`✅ MCP wired (${clientLabel(client)}): ${rel}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  Could not write MCP config for ${clientLabel(client)}: ${message}`);
    }
  }

  // 4. AgentMark agent skill (best-effort; logs its own status)
  installAgentmarkSkill(targetPath);

  // 5. git init — only if this is a greenfield folder
  if (!projectInfo.isExistingProject) {
    initGitRepo(targetPath);
  }

  // 6. Handoff to the AI tool. The integration logic lives in the skill
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

/**
 * Run main() only when this module is invoked directly as the CLI entry —
 * NOT when imported by a test or another module. The pathToFileURL/url
 * comparison is the canonical ESM-friendly "is this the entry script?" check.
 */
const isDirectlyInvoked = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
};

if (isDirectlyInvoked()) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
