#!/usr/bin/env node
/**
 * smoke.mjs — minimal drift check that ships with the skill itself.
 *
 * Run from anywhere with `node skills/agentmark/smoke.mjs` (or from the
 * skill directory directly). Exits 0 if everything checks out, non-zero
 * on drift, with a `FAIL: ...` line per drift finding.
 *
 * Checks (intentionally narrow — see "Why minimal" below):
 *   1. `npx agentmark --help` lists every command the workflows reference.
 *   2. The docs MCP endpoint (`https://docs.agentmark.co/mcp`) responds.
 *      (MCP only accepts POST, so HTTP 405 from a probe GET = healthy.)
 *   3. The docs index (`https://docs.agentmark.co/llms.txt`) responds.
 *   4. Every internal markdown link in SKILL.md and workflows/ resolves
 *      to a real file (no broken `[text](relative/path.md)` references).
 *
 * Why minimal: this script SHIPS WITH the skill (gets mirrored to
 * agentmark-ai/skills via publish-skill.yml) so users who install via
 * `npx skills add agentmark-ai/skills` get a runnable health check
 * with no monorepo, no toolchain, just `node`. It's intentionally
 * dependency-free and quick.
 *
 * For the comprehensive validator — including SHA-256 docs-content
 * fingerprinting (semantic-drift detection), MCP protocol handshake,
 * generator idempotency, inline anti-pattern lint, and source
 * cross-checks against cli-src/index.ts — see the monorepo's
 * `scripts/validate-agentmark-skill.mjs` (run via `yarn ci:validate-skill`).
 * That runs in CI on every PR touching the skill.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const failures = [];
const ok = (msg) => console.log(`OK:   ${msg}`);
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  failures.push(msg);
};

// ─── 1. CLI surface ──────────────────────────────────────────────────────
//
// Every command listed in SKILL.md's "narrow CLI" sentence must show up
// in `npx agentmark --help`. Drift here means an agent recommends a
// command that doesn't exist (or misses a new one users might mention).
//
// execFileSync with an explicit argv array — no shell, no interpolation,
// so there's no command-injection surface even though all the args here
// are hard-coded literals.
const expectedCommands = [
  "dev", "login", "logout", "link",
  "run-prompt", "run-experiment", "build",
  "pull-models", "generate-types", "generate-schema",
];
try {
  const helpOutput = execFileSync(
    "npx",
    ["--yes", "-p", "@agentmark-ai/cli", "agentmark", "--help"],
    { encoding: "utf-8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] },
  );
  const missing = expectedCommands.filter(
    (cmd) => !new RegExp(`^\\s*${cmd}\\b`, "m").test(helpOutput),
  );
  if (missing.length > 0) {
    fail(`CLI surface missing commands: ${missing.join(", ")}`);
  } else {
    ok(`CLI surface: all ${expectedCommands.length} commands present`);
  }
} catch (err) {
  fail(`Could not run \`npx agentmark --help\`: ${err.message?.split("\n")[0] ?? err}`);
}

// ─── 2-3. Docs endpoints reachable ───────────────────────────────────────
//
// The skill deliberately defers integration content to the docs MCP. If
// the docs site moved or the MCP endpoint is down, the workflows can't
// do their job — the agent ends up improvising from memory, which is
// exactly what the skill's docs-MCP-deferral pattern was designed to
// prevent.
//
// MCP endpoints only speak POST with a protocol-specific body. A bare
// GET returns 405 (Method Not Allowed) because the resource exists but
// rejects this verb — exactly the same signal as 200, just verb-shaped.
// 5xx or fetch-rejection = real outage; 404 = endpoint moved/gone.
const docEndpoints = [
  {
    url: "https://docs.agentmark.co/mcp",
    okStatuses: [200, 201, 204, 405], // MCP rejects GET; 405 is healthy
  },
  {
    url: "https://docs.agentmark.co/llms.txt",
    okStatuses: [200],
  },
];
for (const { url, okStatuses } of docEndpoints) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!okStatuses.includes(res.status)) {
      fail(`Docs endpoint returned HTTP ${res.status} (expected ${okStatuses.join("/")}): ${url}`);
    } else {
      ok(`Docs reachable (HTTP ${res.status}): ${url}`);
    }
  } catch (err) {
    fail(`Docs unreachable: ${url} (${err.message})`);
  }
}

// ─── 4. Internal markdown links resolve ──────────────────────────────────
//
// The workflows cross-reference each other heavily ("see
// [headless-with-mcp.md](headless-with-mcp.md)"). A rename or move
// breaks the navigation graph silently — broken links don't error, they
// just leave the agent at a dead end. Validate every internal link
// points at a real file.
//
// Wrap fs ops in try/catch so a missing `SKILL.md` or `workflows/` —
// itself a real drift scenario this check is meant to surface — emits a
// structured `FAIL:` line instead of crashing with a raw exception.
try {
  const workflowsDir = resolve(__dirname, "workflows");
  const mdFiles = [
    "SKILL.md",
    ...readdirSync(workflowsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `workflows/${f}`),
  ];

  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const brokenLinks = [];

  for (const file of mdFiles) {
    const filePath = resolve(__dirname, file);
    let content;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (err) {
      brokenLinks.push(`${file}: could not read (${err.message})`);
      continue;
    }
    const fileDir = dirname(filePath);
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[2];
      // Skip URLs, anchor-only links, mailto:, and curly-brace template refs.
      if (
        /^[a-z][a-z0-9+.-]*:\/\//i.test(href) ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.includes("{")
      ) {
        continue;
      }
      const targetPath = resolve(fileDir, href.split("#")[0]);
      if (!existsSync(targetPath)) {
        brokenLinks.push(`${file}: → ${href}`);
      }
    }
  }

  if (brokenLinks.length > 0) {
    fail(
      `${brokenLinks.length} broken internal link(s):\n        ` +
        brokenLinks.join("\n        "),
    );
  } else {
    ok(`Internal markdown links: all resolve across ${mdFiles.length} file(s)`);
  }
} catch (err) {
  // workflows/ missing, SKILL.md gone, permission error — same shape: structured failure.
  fail(`Could not enumerate skill files for link check: ${err.message}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log("\n✨ Skill is current.");
  process.exit(0);
} else {
  console.error(`\n${failures.length} drift finding(s). Skill needs updating.`);
  process.exit(1);
}
