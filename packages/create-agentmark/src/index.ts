import fs from "fs-extra";
import path from "path";
import prompts from "prompts";
import { pathToFileURL, fileURLToPath } from "url";
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
  /**
   * Non-interactive mode for CI and coding agents: every prompt is replaced
   * by its default (target folder per `defaultFolderName`, all IDE clients,
   * keep an existing agentmark.json). Headless onboarding depends on this —
   * without it the init blocks on a TTY no agent has.
   */
  yes?: boolean;
  help?: boolean;
}

export const ALL_CLIENTS: readonly McpClient[] = ["claude-code", "cursor", "vscode", "zed"];

export const AGENTMARK_JSON: Record<string, unknown> = {
  $schema:
    "https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/agentmark.schema.json",
  version: "2.0.0",
  mdxVersion: "1.0",
  agentmarkPath: ".",
  // Seed one model so the dashboard prompt editor isn't an empty dropdown on
  // first run. Add more with `npx @agentmark-ai/cli pull-models` (writes provider/model
  // entries here) — see https://docs.agentmark.co/configure/model-schemas.
  builtInModels: ["openai/gpt-5.5"],
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
    } else if (arg === "--yes" || arg === "-y") {
      result.yes = true;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
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
 * Resolves which IDE clients to wire MCP into. All 4 are pre-selected on
 * the prompt so the typical "I use everything" case is one keystroke
 * (Enter). Empty selection is equivalent to the old "Skip" option — the
 * caller just writes nothing.
 */
export const resolveClients = async (
  cliClients: McpClient[] | undefined,
  yes?: boolean,
): Promise<McpClient[]> => {
  if (cliClients && cliClients.length > 0) {
    for (const c of cliClients) {
      if (!ALL_CLIENTS.includes(c)) {
        throw new Error(`Invalid client "${c}". Valid: ${ALL_CLIENTS.join(", ")}`);
      }
    }
    return cliClients;
  }
  // --yes mirrors the interactive default: all clients pre-selected.
  if (yes) return [...ALL_CLIENTS];
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

export const USAGE = `Usage: npm create agentmark [folder] [-- options]
       npx create-agentmark [folder] [options]

Sets up AgentMark in a new or existing project: writes agentmark.json,
creates the agentmark/ prompts directory, wires IDE MCP configs, and
installs the AgentMark agent skill.

Options:
  [folder], --path <folder>  Target directory. Default: "." inside an
                             existing project, else "my-agentmark-app".
  --client <ids|all>         IDE clients to wire MCP configs for, comma-
                             separated: claude-code, cursor, vscode, zed.
  -y, --yes                  Non-interactive: accept the default for every
                             prompt (folder default above, all IDE clients,
                             keep an existing agentmark.json). For CI and
                             coding agents.
  --overwrite                Replace an existing agentmark.json with the
                             default config.
  -h, --help                 Show this help.
`;

export const main = async (): Promise<void> => {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    console.log(USAGE);
    return;
  }

  const target = await resolveTargetPath(cliArgs.path, cliArgs.yes);
  if (!target) {
    console.log("Aborted.");
    return;
  }
  const { targetPath } = target;

  const projectInfo = detectProjectInfo(targetPath);
  const clients = await resolveClients(cliArgs.clients, cliArgs.yes);

  console.log("");

  // 1. agentmark.json — the SDK loader's config root
  const agentmarkJsonPath = path.join(targetPath, "agentmark.json");
  if (await shouldWriteAgentmarkJson(agentmarkJsonPath, cliArgs.overwrite, cliArgs.yes)) {
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
 * NOT when imported by a test or another module.
 *
 * Both sides MUST be realpath'd before comparing. npm/npx invoke bins
 * through a `node_modules/.bin` SYMLINK, so `process.argv[1]` is the
 * symlink path while `import.meta.url` is the resolved real path — a naive
 * URL comparison never matches and the CLI exits 0 having done nothing.
 * That exact bug shipped in 1.0.0 and made `npm create agentmark` a silent
 * no-op for every user (macOS additionally symlinks /tmp, which is why
 * even "direct" invocations failed in temp dirs). Regression-pinned by
 * test/bin-invocation.test.ts, which runs the built bin through a symlink.
 */
const isDirectlyInvoked = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryReal = pathToFileURL(fs.realpathSync(entry)).href;
    const selfReal = pathToFileURL(fs.realpathSync(fileURLToPath(import.meta.url))).href;
    return entryReal === selfReal;
  } catch {
    // realpath can throw on exotic entries (deleted cwd, permissions);
    // treat as "not the CLI entry" rather than crashing an import.
    return false;
  }
};

if (isDirectlyInvoked()) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
