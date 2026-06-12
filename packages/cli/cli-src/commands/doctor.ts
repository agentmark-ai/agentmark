import path from "path";
import fs from "fs-extra";
import {
  detectProjectLanguage,
  readAgentmarkConfig,
  AGENTMARK_CONFIG_NOT_FOUND,
  promptsDir,
  findPromptFiles,
  determinePromptKind,
  readFrontmatter,
  validateConfigShape,
  type AgentmarkConfig,
} from "../utils/project";
import {
  clientFileName,
  clientFilePresent,
  clientNotFoundMessages,
  resolveDevEntry,
  devEntryNotFoundMessages,
  resolveHandler,
} from "../utils/setup-files";
import { getRegistryModelMap, classifyModels } from "../utils/models";

/**
 * `agentmark doctor`: a static health check for an AgentMark project.
 *
 * It answers "did I set this up correctly?" without a network call or
 * spawning a server: it inspects the scaffold (config, prompts, client,
 * dev-entry, env hygiene, deps) and reports each finding with an actionable
 * fix. Crucially it reuses the same helpers and emits the same messages the
 * other commands do: `dev`'s client/dev-entry guidance (`../utils/setup-files`),
 * `build`'s config + prompt discovery (`../utils/project`), and
 * `generate-schema`'s model classification (`../utils/models`), so what
 * `doctor` validates is exactly what those commands act on.
 *
 * The check logic lives in `runDoctor()` and is pure (no console, no
 * `process.exit`) so it is unit-testable against filesystem fixtures. The
 * default export is the CLI glue that prints + sets the exit code.
 *
 * Cloud/runtime tiers (auth, gateway reachability, an end-to-end trace
 * round-trip) are deliberately out of scope for this static pass; they slot
 * in later behind future flags using the same `CheckResult` shape.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface CheckResult {
  /** Stable identifier, e.g. `config.agentmarkPath`. */
  id: string;
  /** Display group, e.g. `Project`. */
  group: string;
  /** One-line human title of what was checked. */
  title: string;
  status: CheckStatus;
  /** What was found (shown after the title). */
  detail?: string;
  /** How to fix it (shown on warn/fail). */
  fix?: string;
}

export interface DoctorReport {
  /** True when no check failed (warnings do not fail the report). */
  ok: boolean;
  counts: Record<CheckStatus, number>;
  results: CheckResult[];
}

const GROUP = {
  project: "Project",
  config: "Config & prompts",
  deps: "Dependencies",
} as const;

function readJsonSafe(file: string): Record<string, unknown> | null {
  try {
    return fs.readJsonSync(file) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isEnvGitignored(cwd: string): boolean {
  try {
    const lines = fs.readFileSync(path.join(cwd, ".gitignore"), "utf8").split(/\r?\n/);
    return lines.some((line) => {
      const t = line.trim();
      return t === ".env" || t === ".env*" || t === "*.env" || t === ".env.*";
    });
  } catch {
    return false;
  }
}

function nodeBelow(version: string, major: number, minor: number): boolean {
  const m = version.match(/^v?(\d+)\.(\d+)/);
  if (!m) return false;
  const [maj, min] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  return maj < major || (maj === major && min < minor);
}

export interface RunDoctorOptions {
  /** Defaults to `process.env`; overridable for tests. Only a couple of keys are read. */
  env?: Record<string, string | undefined>;
  /** Defaults to `process.versions.node`; overridable for tests. */
  nodeVersion?: string;
}

/**
 * Run all static checks against `cwd` and return a structured report.
 * Pure: no console output, no `process.exit`.
 */
export async function runDoctor(cwd: string, opts: RunDoctorOptions = {}): Promise<DoctorReport> {
  const env = opts.env ?? process.env;
  const nodeVersion = opts.nodeVersion ?? process.versions.node;
  const results: CheckResult[] = [];
  const add = (r: CheckResult) => results.push(r);

  const language = detectProjectLanguage(cwd);

  // ── Project ──────────────────────────────────────────────────────────────

  // agentmark.json present + valid JSON (gates the config/prompt checks).
  const cfg = readAgentmarkConfig(cwd);
  let config: AgentmarkConfig | null = null;
  if (!cfg.exists) {
    add({
      id: "config.found",
      group: GROUP.project,
      title: "agentmark.json missing",
      status: "fail",
      detail: "no agentmark.json in this directory",
      fix: AGENTMARK_CONFIG_NOT_FOUND,
    });
  } else if (!cfg.config) {
    add({
      id: "config.found",
      group: GROUP.project,
      title: "agentmark.json invalid",
      status: "fail",
      detail: cfg.parseError,
      fix: "Fix the JSON syntax in agentmark.json.",
    });
  } else {
    config = cfg.config;
    add({ id: "config.found", group: GROUP.project, title: "agentmark.json present", status: "pass" });
  }

  // agentmarkPath resolves to a real prompts directory (the "/" footgun).
  let promptDir: string | null = null;
  if (config) {
    const agentmarkPath = typeof config.agentmarkPath === "string" ? config.agentmarkPath : ".";
    if (agentmarkPath === "/") {
      add({
        id: "config.agentmarkPath",
        group: GROUP.project,
        title: "agentmarkPath resolves",
        status: "fail",
        detail: 'agentmarkPath is "/", which resolves to the filesystem root',
        fix: 'Set "agentmarkPath": "." in agentmark.json.',
      });
    } else {
      const dir = promptsDir(cwd, config);
      if (fs.existsSync(dir)) {
        promptDir = dir;
        add({
          id: "config.agentmarkPath",
          group: GROUP.project,
          title: "agentmarkPath resolves",
          status: "pass",
          detail: path.relative(cwd, dir) || ".",
        });
      } else {
        add({
          id: "config.agentmarkPath",
          group: GROUP.project,
          title: "agentmarkPath resolves",
          status: "fail",
          detail: `prompts directory not found: ${path.relative(cwd, dir) || dir}`,
          fix: 'Create the agentmark/ directory, or fix "agentmarkPath" (use "." for the standard layout).',
        });
      }
    }

    // agentmark.json shape: required keys present, no unknown top-level keys
    // (the schema is additionalProperties: false).
    const shape = validateConfigShape(config);
    if (shape.missingRequired.length === 0 && shape.unknownKeys.length === 0) {
      add({ id: "config.schema", group: GROUP.project, title: "agentmark.json fields valid", status: "pass" });
    } else {
      const parts = [
        shape.missingRequired.length > 0 && `missing required: ${shape.missingRequired.join(", ")}`,
        shape.unknownKeys.length > 0 && `unknown key(s): ${shape.unknownKeys.join(", ")}`,
      ].filter(Boolean);
      add({
        id: "config.schema",
        group: GROUP.project,
        title: "agentmark.json fields valid",
        status: "warn",
        detail: parts.join("; "),
        fix: "Match the bundled agentmark.schema.json: `version` is required, and unknown top-level keys are ignored (check for typos).",
      });
    }
  }

  // Client file present. Shares dev's exact guidance.
  const clientFile = clientFileName(language);
  add(
    clientFilePresent(cwd, language)
      ? { id: "client.file", group: GROUP.project, title: `${clientFile} present`, status: "pass" }
      : {
          id: "client.file",
          group: GROUP.project,
          title: `${clientFile} missing`,
          status: "fail",
          detail: `no ${clientFile} at the project root`,
          fix: clientNotFoundMessages(language)[1],
        }
  );

  // Dev-server entry present. Shares dev's resolution + guidance (warn: only
  // needed for `dev` / the Dashboard Run button, not for tracing-only setups).
  add(
    resolveDevEntry(cwd, language).exists
      ? { id: "devEntry.file", group: GROUP.project, title: "dev server entry present", status: "pass" }
      : {
          id: "devEntry.file",
          group: GROUP.project,
          title: "dev server entry missing",
          status: "warn",
          detail: '`agentmark dev` and the local Run button need it (tracing-only setups do not)',
          fix: devEntryNotFoundMessages(language)[2],
        }
  );

  // Managed-deployment handler. This is the entry AgentMark Cloud bundles to
  // deploy your client (which powers the hosted Dashboard's Run buttons). It is
  // not loaded locally (the dev-entry serves local runs), so:
  //   - configured path that does not resolve → fail (a definite bug; the
  //     project opted into deployment via `config.handler`),
  //   - no handler at all → warn (can't deploy yet; managed deploy is opt-in),
  //   - handler resolves → pass.
  if (config) {
    const handler = resolveHandler(cwd, typeof config.handler === "string" ? config.handler : undefined);
    const defaultHandler = language === "python" ? "handler.py" : "handler.ts";
    if (handler.exists) {
      add({
        id: "deploy.handler",
        group: GROUP.project,
        title: "deployment handler present",
        status: "pass",
        detail: path.relative(cwd, handler.path as string),
      });
    } else if (handler.fromConfig) {
      add({
        id: "deploy.handler",
        group: GROUP.project,
        title: "deployment handler broken",
        status: "fail",
        detail: `config.handler points to "${String(config.handler)}", which does not exist`,
        fix: 'Create that file, or fix the "handler" path in agentmark.json. It is the entry AgentMark Cloud bundles for managed deployment. See https://docs.agentmark.co/deploy/deployment.',
      });
    } else {
      add({
        id: "deploy.handler",
        group: GROUP.project,
        title: "deployment handler missing",
        status: "warn",
        detail: `no ${defaultHandler} found; AgentMark Cloud needs it to deploy your client (the hosted Dashboard's Run buttons)`,
        fix: `Add a deployment entry (${defaultHandler}), or set "handler" in agentmark.json. See https://docs.agentmark.co/deploy/deployment.`,
      });
    }
  }

  // Cloud credentials available (warn).
  const hasKey = !!env.AGENTMARK_API_KEY;
  const hasApp = !!env.AGENTMARK_APP_ID;
  if (hasKey && hasApp) {
    add({ id: "env.credentials", group: GROUP.project, title: "AgentMark credentials set", status: "pass" });
  } else {
    const missing = [!hasKey && "AGENTMARK_API_KEY", !hasApp && "AGENTMARK_APP_ID"].filter(Boolean).join(" and ");
    add({
      id: "env.credentials",
      group: GROUP.project,
      title: "AgentMark credentials set",
      status: "warn",
      detail: `${missing} not set, required to send traces to AgentMark Cloud`,
      fix: "Add them to .env (the CLI loads .env from the project root), or export them in your shell.",
    });
  }

  // .env gitignored (warn, only when a .env exists).
  if (fs.existsSync(path.join(cwd, ".env"))) {
    add(
      isEnvGitignored(cwd)
        ? { id: "env.gitignored", group: GROUP.project, title: ".env is gitignored", status: "pass" }
        : {
            id: "env.gitignored",
            group: GROUP.project,
            title: ".env is gitignored",
            status: "warn",
            detail: ".env exists but is not covered by .gitignore, so your keys could be committed",
            fix: "Add `.env` to .gitignore.",
          }
    );
  }

  // Node version (warn: --env-file needs 20.6+).
  if (nodeBelow(nodeVersion, 20, 6)) {
    add({
      id: "runtime.node",
      group: GROUP.project,
      title: "Node.js >= 20.6",
      status: "warn",
      detail: `running Node ${nodeVersion}; \`node --env-file=.env\` needs 20.6+`,
      fix: "Upgrade Node.js, or load .env another way (e.g. dotenv).",
    });
  }

  // ── Config & prompts ─────────────────────────────────────────────────────

  const builtIn = Array.isArray(config?.builtInModels) ? (config!.builtInModels as unknown[]).map(String) : [];
  // Models referenced by prompts (populated below; feeds the builtInModels allowlist check).
  const usedModels = new Set<string>();

  if (promptDir) {
    const promptFiles = await findPromptFiles(promptDir);
    if (promptFiles.length === 0) {
      add({
        id: "prompts.present",
        group: GROUP.config,
        title: "prompts found",
        status: "warn",
        detail: "no .prompt.mdx files yet",
        fix: "Add a prompt under the agentmark/ directory.",
      });
    } else {
      add({
        id: "prompts.present",
        group: GROUP.config,
        title: "prompts found",
        status: "pass",
        detail: `${promptFiles.length} prompt(s)`,
      });

      const parseErrors: string[] = [];
      for (const file of promptFiles) {
        const rel = path.relative(cwd, file);
        let content: string;
        try {
          content = fs.readFileSync(file, "utf8");
        } catch {
          parseErrors.push(`${rel}: cannot read file`);
          continue;
        }
        const fm = readFrontmatter(content);
        if (!fm.ok) {
          parseErrors.push(`${rel}: ${fm.error}`);
          continue;
        }
        // Reuse build's kind detection: it throws when no *_config block exists.
        let kind: ReturnType<typeof determinePromptKind>;
        try {
          kind = determinePromptKind(fm.data);
        } catch {
          parseErrors.push(`${rel}: no *_config block in frontmatter`);
          continue;
        }
        const settings = fm.data[`${kind}_config`] as Record<string, unknown> | undefined;
        const model = settings?.model_name;
        if (typeof model !== "string" || model.length === 0) {
          parseErrors.push(`${rel}: ${kind}_config.model_name is missing`);
          continue;
        }
        usedModels.add(model);
      }

      add(
        parseErrors.length === 0
          ? { id: "prompts.parse", group: GROUP.config, title: "prompts parse and declare a model", status: "pass" }
          : {
              id: "prompts.parse",
              group: GROUP.config,
              title: "prompts parse and declare a model",
              status: "fail",
              detail: parseErrors.join("; "),
              fix: "Each prompt needs valid YAML frontmatter, a *_config block, and a model_name. See https://docs.agentmark.co/reference/troubleshooting.",
            }
      );

      // builtInModels is an allowlist: when non-empty, prompt-core rejects any
      // prompt whose model_name is not listed; when empty, there is no
      // enforcement (and no IDE autocomplete). Surface both cases accurately.
      if (usedModels.size > 0) {
        if (builtIn.length === 0) {
          add({
            id: "models.builtIn",
            group: GROUP.config,
            title: "prompt models declared in builtInModels",
            status: "warn",
            detail: "builtInModels is empty: no allowlist enforcement and no IDE autocomplete for model_name",
            fix: "Run `npx @agentmark-ai/cli pull-models` to populate builtInModels, then `npx @agentmark-ai/cli generate-schema`.",
          });
        } else {
          const notDeclared = [...usedModels].filter((m) => !builtIn.includes(m));
          add(
            notDeclared.length === 0
              ? { id: "models.builtIn", group: GROUP.config, title: "prompt models declared in builtInModels", status: "pass" }
              : {
                  id: "models.builtIn",
                  group: GROUP.config,
                  title: "prompt models declared in builtInModels",
                  status: "warn",
                  detail: `not in builtInModels: ${notDeclared.join(", ")}. builtInModels is non-empty, so prompt-core enforces it as an allowlist and rejects these prompts at runtime`,
                  fix: "Add them to builtInModels (or run `npx @agentmark-ai/cli pull-models`), then `npx @agentmark-ai/cli generate-schema`.",
                }
          );
        }
      }
    }
  }

  // builtInModels recognized by the model catalog (warn). Reuses the same
  // classification generate-schema uses to build the frontmatter enum.
  if (config && builtIn.length > 0) {
    try {
      const { unknownModels } = classifyModels(await getRegistryModelMap(), builtIn);
      add(
        unknownModels.length === 0
          ? { id: "models.known", group: GROUP.config, title: "builtInModels recognized by the model catalog", status: "pass" }
          : {
              id: "models.known",
              group: GROUP.config,
              title: "builtInModels recognized by the model catalog",
              status: "warn",
              detail: `not in AgentMark's model catalog: ${unknownModels.join(", ")} (a typo, or a very new model)`,
              fix: "Double-check the name, or run `npx @agentmark-ai/cli pull-models` to add a known model.",
            }
      );
    } catch {
      // Registry unavailable (offline / load failure); skip rather than fail.
      add({ id: "models.known", group: GROUP.config, title: "builtInModels recognized by the model catalog", status: "skip", detail: "model catalog unavailable" });
    }
  }

  // ── Dependencies (TypeScript) ────────────────────────────────────────────

  if (language === "typescript") {
    const pkg = readJsonSafe(path.join(cwd, "package.json"));
    const deps: Record<string, unknown> = pkg
      ? { ...((pkg.dependencies as Record<string, unknown>) ?? {}), ...((pkg.devDependencies as Record<string, unknown>) ?? {}) }
      : {};
    if (!pkg) {
      add({ id: "deps.packageJson", group: GROUP.deps, title: "package.json missing", status: "skip", detail: "no package.json found" });
    } else {
      add(
        deps["@agentmark-ai/sdk"]
          ? { id: "deps.sdk", group: GROUP.deps, title: "@agentmark-ai/sdk installed", status: "pass" }
          : {
              id: "deps.sdk",
              group: GROUP.deps,
              title: "@agentmark-ai/sdk installed",
              status: "warn",
              detail: "needed for tracing and experiments",
              fix: "npm install @agentmark-ai/sdk",
            }
      );
    }
  } else {
    add({
      id: "deps.python",
      group: GROUP.deps,
      title: "dependency checks",
      status: "skip",
      detail: "Python project; ensure agentmark-prompt-core and agentmark-sdk are installed",
    });
  }

  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of results) counts[r.status]++;

  return { ok: counts.fail === 0, counts, results };
}

const GLYPH: Record<CheckStatus, string> = { pass: "✓", warn: "⚠", fail: "✗", skip: "○" };
const GROUP_ORDER: string[] = [GROUP.project, GROUP.config, GROUP.deps];

function printReport(report: DoctorReport): void {
  console.log("\nAgentMark doctor\n");

  // Known groups first, then any extra group (e.g. the --smoke live run) in
  // the order it first appears, so new tiers render without touching this list.
  const extraGroups = [...new Set(report.results.map((r) => r.group))].filter((g) => !GROUP_ORDER.includes(g));
  for (const group of [...GROUP_ORDER, ...extraGroups]) {
    const groupResults = report.results.filter((r) => r.group === group);
    if (groupResults.length === 0) continue;
    console.log(group);
    for (const r of groupResults) {
      const head = `  ${GLYPH[r.status]} ${r.title}`;
      console.log(r.detail ? `${head}: ${r.detail}` : head);
      if ((r.status === "fail" || r.status === "warn") && r.fix) {
        console.log(`      → ${r.fix}`);
      }
    }
    console.log("");
  }

  console.log("─".repeat(60));
  const { pass, warn, fail } = report.counts;
  console.log(`${pass} passed · ${warn} warning(s) · ${fail} failed`);
  if (fail > 0) {
    console.log("✗ Setup has problems. Fix the failed checks above.");
  } else if (warn > 0) {
    console.log("⚠ Setup looks workable. Review the warnings above.");
  } else {
    console.log("✓ Your AgentMark project looks healthy.");
  }
  console.log("");
}

interface DoctorOptions {
  json?: boolean;
  /** Exit non-zero on warnings too (for CI). */
  strict?: boolean;
  /** Also run the live tier: execute a prompt and verify the emitted trace. */
  smoke?: boolean;
  /** Prompt to run for `--smoke` (defaults to the first discovered prompt). */
  prompt?: string;
  /** Props forwarded as `customProps` in the `--smoke` webhook call (satisfies required variables). */
  props?: Record<string, unknown>;
  /** With `--smoke`, boot `agentmark dev` automatically (and tear it down after). */
  boot?: boolean;
  /** Webhook port `--smoke` targets (and `--boot` starts dev on). Defaults to 9417. */
  webhookPort?: number;
  /** API-server port `--smoke` reads traces from (and `--boot` starts dev on). Defaults to 9418. */
  apiPort?: number;
}

const doctor = async (options: DoctorOptions = {}): Promise<void> => {
  const report = await runDoctor(process.cwd());

  // Live tier (opt-in). Appends its results to the same report so counts + exit
  // code cover static and live together. Without --boot it assumes `agentmark
  // dev` is already running; with --boot it starts one headless and tears it
  // down after (a single command for agents / CI).
  if (options.smoke) {
    const { runSmoke, bootDevServer, SMOKE_GROUP } = await import("./doctor-smoke.js");
    const webhookPort = options.webhookPort ?? 9417;
    const apiPort = options.apiPort ?? 9418;
    let boot: { teardown: () => void } | undefined;
    let bootFailed = false;
    if (options.boot) {
      try {
        boot = await bootDevServer({ cwd: process.cwd(), webhookPort, apiPort });
      } catch (err) {
        bootFailed = true;
        report.results.push({
          id: "smoke.boot",
          group: SMOKE_GROUP,
          title: "dev server booted",
          status: "fail",
          detail: (err as Error).message,
          fix: "Start it yourself with `npx @agentmark-ai/cli dev` in another terminal and re-run `npx @agentmark-ai/cli doctor --smoke` (without --boot), or fix the startup error reported above.",
        });
        report.counts.fail++;
      }
    }
    try {
      if (!bootFailed) {
        const smokeResults = await runSmoke({
          cwd: process.cwd(),
          promptPath: options.prompt,
          customProps: options.props,
          webhookUrl: `http://localhost:${webhookPort}`,
          apiUrl: `http://localhost:${apiPort}`,
        });
        report.results.push(...smokeResults);
        for (const r of smokeResults) report.counts[r.status]++;
      }
    } finally {
      boot?.teardown();
    }
    report.ok = report.counts.fail === 0;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  const failed = report.counts.fail > 0 || (!!options.strict && report.counts.warn > 0);
  process.exit(failed ? 1 : 0);
};

export default doctor;
