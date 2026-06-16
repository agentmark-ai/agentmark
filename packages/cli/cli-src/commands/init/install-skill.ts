import { execFileSync } from "child_process";

/**
 * Installs the AgentMark agent skill (https://github.com/agentmark-ai/skills)
 * into the freshly-scaffolded project. The vercel-labs/skills tool puts files
 * at `./.agents/skills/agentmark/` and symlinks them into per-tool paths
 * (Claude Code, Codex, Cursor, GitHub Copilot, +others) per the
 * agentskills.io 0.0.2 spec.
 *
 * Uses execFileSync (no shell) for safety. All arguments are hardcoded
 * literals; no user input is interpolated.
 *
 * Best-effort: if the install fails (no network, npx unavailable, etc.) we
 * log a warning and keep going. The skill is a nice-to-have on top of a
 * working AgentMark project, not a hard requirement.
 */
/**
 * True when the helper should skip the network install. Set in test runs
 * so the OSS Parity CI suite doesn't hit `npx skills add` per scaffolder
 * test (each call clones the public skills repo, adding 10-30s/test).
 *
 * Detected via:
 *   - VITEST=true               (Vitest sets this automatically)
 *   - NODE_ENV=test             (broad convention; many runners set this)
 *   - AGENTMARK_SKIP_SKILL_INSTALL=1  (explicit opt-out for any other context)
 */
const shouldSkip = (): boolean =>
  process.env.VITEST === "true" ||
  process.env.NODE_ENV === "test" ||
  process.env.AGENTMARK_SKIP_SKILL_INSTALL === "1";

export const installAgentmarkSkill = (targetPath: string): void => {
  if (shouldSkip()) {
    console.log("\n⏭️  Skipping agent skill install (test environment detected).");
    return;
  }
  try {
    console.log("\n📚 Installing AgentMark agent skill...");
    console.log("   (teaches Claude Code / Codex / Cursor / Copilot how to use AgentMark)");
    execFileSync(
      "npx",
      ["--yes", "skills", "add", "agentmark-ai/skills"],
      {
        cwd: targetPath,
        stdio: "inherit",
      },
    );
    console.log("✅ Agent skill installed at ./.agents/skills/agentmark/");
  } catch (error) {
    console.warn(
      "\n⚠️  Could not install the AgentMark agent skill automatically.",
    );
    console.warn("   You can install it later with:");
    console.warn("     cd " + targetPath);
    console.warn("     npx skills add agentmark-ai/skills");
    if (error instanceof Error) {
      console.warn(`   Reason: ${error.message.split("\n")[0]}`);
    }
  }
};
