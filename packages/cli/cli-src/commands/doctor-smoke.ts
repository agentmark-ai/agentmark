import path from "path";
import net from "net";
import { spawn, type ChildProcess } from "child_process";
import {
  readAgentmarkConfig,
  promptsDir,
  findPromptFiles,
} from "../utils/project";
import { killProcessTree } from "../utils/platform";
import { loadAst as defaultLoadAst } from "./run-prompt";
import type { CheckResult } from "./doctor";

/**
 * `agentmark doctor --smoke`: the live tier. Where the static checks confirm the
 * project is *shaped* right, the smoke run confirms it actually *works* — end to
 * end — without `doctor` knowing anything about which SDK, provider, or keys are
 * in play.
 *
 * It runs one representative prompt through the already-running dev server (the
 * same webhook `run-prompt` hits), then fetches the trace that run emitted from
 * the local API server and checks its shape. A real answer with token usage
 * proves the SDK/adapter and provider credentials work; a well-formed trace
 * coming back proves tracing is wired in the right format. Both are verified
 * indirectly, so there is no per-provider map to maintain.
 *
 * v1 assumes `agentmark dev` is already running; if the webhook is unreachable
 * it fails with the same guidance `run-prompt` gives. Every dependency that
 * touches the network, the filesystem, or the clock is injectable so the logic
 * is unit-testable without a live server.
 */

export const SMOKE_GROUP = "Live run (--smoke)";

export const DEFAULT_WEBHOOK_URL = "http://localhost:9417";
export const DEFAULT_API_URL = "http://localhost:9418";

export interface SmokeOptions {
  cwd: string;
  /** Explicit prompt to run; defaults to the first discovered `.prompt.mdx`. */
  promptPath?: string;
  /** Webhook the dev server serves (`run-prompt`'s target). */
  webhookUrl?: string;
  /** Local API server that stores + serves traces. */
  apiUrl?: string;
  /** How long to wait for the emitted trace to land (ms). */
  traceTimeoutMs?: number;
  /** Poll interval while waiting for the trace (ms). */
  tracePollMs?: number;
  // ── injectable seams (default to the real implementations) ──────────────
  fetchImpl?: typeof fetch;
  loadAstImpl?: (file: string) => Promise<{ ast: unknown; promptName?: string }>;
  sleepImpl?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function isConnRefused(err: unknown): boolean {
  const e = err as { message?: string; cause?: { code?: string } };
  return (
    e?.cause?.code === "ECONNREFUSED" ||
    !!e?.message?.includes("ECONNREFUSED") ||
    !!e?.message?.includes("fetch failed")
  );
}

interface WebhookResult {
  type?: string;
  result?: unknown;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  traceId?: string;
}

interface TraceDetailShape {
  tokens?: unknown;
  input?: unknown;
  output?: unknown;
  spans?: Array<{ model?: string | null }>;
}

/** True when the runner returned actual content (string, object, or media array). */
function hasOutput(result: unknown): boolean {
  if (result == null) return false;
  if (typeof result === "string") return result.trim().length > 0;
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result === "object") return Object.keys(result as object).length > 0;
  return true;
}

/**
 * Parse the `{ type:'evals', result:'<json names>' }` control-plane envelope the
 * handler returns for a `get-evals` job. Returns the eval names (possibly empty),
 * or `null` if the shape is wrong (a handler that can't answer get-evals).
 */
function parseEvalNames(payload: unknown): string[] | null {
  const p = payload as { type?: unknown; result?: unknown };
  if (p?.type !== "evals" || typeof p.result !== "string") return null;
  try {
    const parsed = JSON.parse(p.result) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : null;
  } catch {
    return null;
  }
}

/**
 * Run the live smoke checks and return their results (group `SMOKE_GROUP`).
 * On the first hard failure (no prompt, server unreachable, run failed) it
 * returns early — the later checks can't be meaningful without it.
 */
export async function runSmoke(opts: SmokeOptions): Promise<CheckResult[]> {
  const {
    cwd,
    webhookUrl = DEFAULT_WEBHOOK_URL,
    apiUrl = DEFAULT_API_URL,
    traceTimeoutMs = 8000,
    tracePollMs = 400,
    fetchImpl = fetch,
    loadAstImpl = defaultLoadAst,
    sleepImpl = realSleep,
  } = opts;
  const results: CheckResult[] = [];
  const fail = (id: string, title: string, detail: string, fix?: string): CheckResult[] => {
    results.push({ id, group: SMOKE_GROUP, title, status: "fail", detail, fix });
    return results;
  };

  // 1. Pick a prompt to run (explicit, else the first discovered).
  let promptFile = opts.promptPath ? path.resolve(cwd, opts.promptPath) : undefined;
  if (!promptFile) {
    const cfg = readAgentmarkConfig(cwd);
    if (!cfg.config) {
      return fail("smoke.prompt", "a prompt to run", "agentmark.json is missing or invalid, so no prompt could be located", "Fix the static checks above first, then re-run with --smoke.");
    }
    const dir = promptsDir(cwd, cfg.config);
    const found = await findPromptFiles(dir);
    if (found.length === 0) {
      return fail("smoke.prompt", "a prompt to run", "no .prompt.mdx files found to run", "Add a prompt under the agentmark/ directory, or pass --prompt <path>.");
    }
    promptFile = found.sort()[0];
  }
  const relPrompt = path.relative(cwd, promptFile) || promptFile;

  // 2. Build the AST.
  let ast: unknown;
  let promptName: string | undefined;
  try {
    ({ ast, promptName } = await loadAstImpl(promptFile));
  } catch (err) {
    return fail("smoke.prompt", "a prompt to run", `could not parse ${relPrompt}: ${(err as Error).message}`, "Run `agentmark doctor` (static) to find the prompt problem.");
  }

  // 3. Run it through the dev server's webhook (non-streaming for a clean result).
  let webhook: WebhookResult;
  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "prompt-run",
        data: { ast, promptPath: promptName, options: { shouldStream: false } },
      }),
    });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch { /* ignore */ }
      return fail(
        "smoke.run",
        `prompt runs (${relPrompt})`,
        `the dev server returned HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
        "Check the `agentmark dev` terminal for the error (often a bad provider key or an adapter/SDK mismatch).",
      );
    }
    webhook = (await res.json()) as WebhookResult;
  } catch (err) {
    if (isConnRefused(err)) {
      return fail(
        "smoke.run",
        `prompt runs (${relPrompt})`,
        `could not reach the dev server at ${webhookUrl}`,
        "Start it in another terminal with `agentmark dev`, then re-run `agentmark doctor --smoke`.",
      );
    }
    return fail("smoke.run", `prompt runs (${relPrompt})`, `request to ${webhookUrl} failed: ${(err as Error).message}`);
  }

  // 4. The run produced real content + token usage (proves SDK + provider creds).
  const usage = webhook.usage ?? {};
  const totalTokens = usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
  if (!hasOutput(webhook.result) || totalTokens <= 0) {
    results.push({
      id: "smoke.run",
      group: SMOKE_GROUP,
      title: `prompt runs (${relPrompt})`,
      status: "fail",
      detail: !hasOutput(webhook.result)
        ? "the dev server responded but returned no content"
        : "the dev server returned content but no token usage, so the model may not have actually run",
      fix: "Check the `agentmark dev` terminal output for the underlying model/SDK error.",
    });
    return results;
  }
  results.push({
    id: "smoke.run",
    group: SMOKE_GROUP,
    title: `prompt runs (${relPrompt})`,
    status: "pass",
    detail: `${usage.promptTokens ?? 0} in, ${usage.completionTokens ?? 0} out, ${totalTokens} total`,
  });

  // Control-plane: the handler lists its evals — exactly what the dashboard's New
  // Experiment dialog reads (get-evals). A handler that can't answer it (e.g. a
  // hand-rolled prompt-run/dataset-run switch) is the empty-dialog bug; the count
  // surfaces a client with no evals registered.
  try {
    const evalsRes = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "get-evals", data: {} }),
    });
    const names = evalsRes.ok ? parseEvalNames(await evalsRes.json()) : null;
    if (!evalsRes.ok || names === null) {
      results.push({
        id: "smoke.evals",
        group: SMOKE_GROUP,
        title: "evals are listable (get-evals)",
        status: "fail",
        detail: evalsRes.ok
          ? "the dev server answered get-evals but not with the expected {type:'evals'} payload"
          : `the dev server returned HTTP ${evalsRes.status} for the get-evals control-plane job`,
        fix: "Your deployed handler must route get-evals — the canonical handler is `runner.dispatch` (a hand-rolled prompt-run/dataset-run switch drops it, leaving the New Experiment dialog empty). See https://docs.agentmark.co/deploy/deployment.",
      });
    } else {
      results.push({
        id: "smoke.evals",
        group: SMOKE_GROUP,
        title: "evals are listable (get-evals)",
        status: "pass",
        detail:
          names.length > 0
            ? `${names.length} eval${names.length === 1 ? "" : "s"}: ${names.join(", ")}`
            : "0 evals registered (register them on your client to use them in experiments)",
      });
    }
  } catch (err) {
    results.push({
      id: "smoke.evals",
      group: SMOKE_GROUP,
      title: "evals are listable (get-evals)",
      status: "warn",
      detail: `could not check get-evals: ${(err as Error).message}`,
    });
  }

  // 5. The run emitted a trace we can fetch back from the local API server.
  if (!webhook.traceId) {
    results.push({
      id: "smoke.trace",
      group: SMOKE_GROUP,
      title: "trace emitted",
      status: "fail",
      detail: "the run succeeded but returned no traceId, so tracing is not wired",
      fix: "Ensure your client is created via the AgentMark SDK (it installs the tracing exporter). See https://docs.agentmark.co/observe/tracing-setup.",
    });
    return results;
  }
  const traceUrl = `${apiUrl}/v1/traces/${webhook.traceId}`;
  let trace: TraceDetailShape | null = null;
  const deadline = traceTimeoutMs;
  let waited = 0;
  while (waited <= deadline) {
    try {
      const res = await fetchImpl(traceUrl, { method: "GET" });
      if (res.ok) {
        const body = (await res.json()) as { data?: TraceDetailShape };
        if (body?.data) { trace = body.data; break; }
      }
    } catch { /* not there yet */ }
    if (waited === deadline) break;
    await sleepImpl(tracePollMs);
    waited += tracePollMs;
  }
  if (!trace) {
    results.push({
      id: "smoke.trace",
      group: SMOKE_GROUP,
      title: "trace emitted",
      status: "fail",
      detail: `trace ${webhook.traceId} did not arrive at ${apiUrl} within ${Math.round(deadline / 1000)}s`,
      fix: "Traces flush asynchronously; if it never lands, confirm the SDK tracing exporter points at the local dev API server.",
    });
    return results;
  }
  const modelSpan = (trace.spans ?? []).find((s) => typeof s.model === "string" && s.model.length > 0);
  results.push({
    id: "smoke.trace",
    group: SMOKE_GROUP,
    title: "trace emitted",
    status: "pass",
    detail: `trace ${webhook.traceId} landed${modelSpan ? `: model ${modelSpan.model}` : ""}`,
  });

  // 6. The trace is well-formed: usage, input, output, and a model on a span.
  const missing = [
    trace.tokens == null && "token usage",
    trace.input == null && "input",
    trace.output == null && "output",
    !modelSpan && "a model on any span",
  ].filter(Boolean) as string[];
  results.push(
    missing.length === 0
      ? {
          id: "smoke.traceShape",
          group: SMOKE_GROUP,
          title: "trace has the expected shape",
          status: "pass",
          detail: "tokens, input, output, and a model span all present",
        }
      : {
          id: "smoke.traceShape",
          group: SMOKE_GROUP,
          title: "trace has the expected shape",
          status: "fail",
          detail: `the trace is missing: ${missing.join(", ")}`,
          fix: "The trace round-tripped but is incomplete. Check your adapter/executor maps usage + I/O onto the span. See https://docs.agentmark.co/observe/tracing-setup.",
        },
  );

  return results;
}

// ── --boot: self-start the dev server, wait until ready, hand back teardown ──

export interface BootHandle {
  /** Kill the spawned dev-server process tree. Safe to call more than once. */
  teardown: () => void;
}

export interface BootOptions {
  cwd: string;
  /** CLI entry to spawn `dev` from; defaults to the running script. */
  cliEntry?: string;
  webhookPort?: number;
  apiPort?: number;
  /** Max time to wait for both ports to accept connections (ms). */
  readyTimeoutMs?: number;
  readyPollMs?: number;
  // ── injectable seams (default to the real implementations) ──
  spawnImpl?: typeof spawn;
  probeImpl?: (port: number) => Promise<boolean>;
  killImpl?: (pid: number) => void;
  sleepImpl?: (ms: number) => Promise<void>;
}

/** True when something is accepting TCP connections on `port` (localhost). */
function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

/**
 * Start `agentmark dev` headless (`--no-ui --no-forward`) and resolve once both
 * the webhook and API ports accept connections, handing back a `teardown` that
 * kills the process tree. Rejects (after teardown) if the server exits early or
 * never becomes ready — the early-exit message carries the dev server's own
 * stderr tail, which is usually the real reason (missing client, bad dev-entry).
 *
 * This is what makes `--smoke --boot` a single command: an agent (or CI) gets
 * the live verification without orchestrating a second terminal.
 */
export async function bootDevServer(opts: BootOptions): Promise<BootHandle> {
  const {
    cwd,
    cliEntry = process.argv[1],
    webhookPort = 9417,
    apiPort = 9418,
    readyTimeoutMs = 30000,
    readyPollMs = 500,
    spawnImpl = spawn,
    probeImpl = probePort,
    killImpl = killProcessTree,
    sleepImpl = realSleep,
  } = opts;

  // `cliEntry` defaults to the running script so a spawned `dev` is the same
  // binary as the `doctor` invoking it. This is correct for the normal CLI
  // entry; pass it explicitly if you ever invoke through a bundled/renamed shim.
  const child: ChildProcess = spawnImpl(
    process.execPath,
    [cliEntry, "dev", "--no-ui", "--no-forward", "--webhook-port", String(webhookPort), "--api-port", String(apiPort)],
    { cwd, stdio: ["ignore", "ignore", "pipe"], env: process.env },
  );

  let exited = false;
  let exitCode: number | null = null;
  let spawnErrorMsg = "";
  let stderrTail = "";
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  // A spawn-level failure (e.g. the entry can't be executed) emits 'error', not
  // 'exit' — catch it so boot fails fast instead of waiting out the timeout.
  child.on("error", (err) => {
    spawnErrorMsg = err.message;
  });
  child.stderr?.on("data", (d) => {
    stderrTail = (stderrTail + String(d)).slice(-4000);
  });

  let toreDown = false;
  const teardown = () => {
    if (toreDown) return;
    toreDown = true;
    if (child.pid && !exited) {
      try {
        killImpl(child.pid);
      } catch {
        /* already gone */
      }
    }
  };

  let waited = 0;
  for (;;) {
    if (spawnErrorMsg) {
      teardown();
      throw new Error(`could not start agentmark dev: ${spawnErrorMsg}`);
    }
    if (exited) {
      teardown();
      const why = stderrTail.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(" ");
      throw new Error(`agentmark dev exited early (code ${exitCode})${why ? `: ${why}` : ""}`);
    }
    const [webhookUp, apiUp] = await Promise.all([probeImpl(webhookPort), probeImpl(apiPort)]);
    if (webhookUp && apiUp) return { teardown };
    if (waited >= readyTimeoutMs) {
      teardown();
      throw new Error(`agentmark dev did not become ready within ${Math.round(readyTimeoutMs / 1000)}s`);
    }
    await sleepImpl(readyPollMs);
    waited += readyPollMs;
  }
}
