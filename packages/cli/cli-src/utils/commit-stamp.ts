/**
 * Local prompt-version stamping for the dev server's /v1/templates route.
 *
 * AgentMark Cloud's gateway injects `agentmark_meta.commit_sha` (the commit
 * the prompt content was served at) into every served prompt AST so traces
 * link back to the exact prompt VERSION. The CLI dev server mirrors that for
 * local development by stamping `git rev-parse HEAD` — the same best-effort
 * pattern the /v1/config route and run-experiment already use. Outside a git
 * repo (or on any git failure) the AST is served unstamped.
 */

import { execFileSync } from "child_process";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

/**
 * Resolve the local repo's HEAD commit sha. Best-effort: returns null when
 * not in a git repo, git is missing, or the command fails for any reason.
 */
export function resolveLocalCommitSha(projectRoot: string): string | null {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}

/**
 * Inject `agentmark_meta.commit_sha` into a parsed prompt AST's frontmatter
 * yaml node, in place. Mirrors the gateway's ast-processor: walks the AST for
 * the first `yaml` node, merges the sha into any existing `agentmark_meta`,
 * and re-stringifies. No-ops (never throws) on a missing frontmatter node,
 * empty sha, or malformed yaml — stamping must never break template serving.
 */
export function injectCommitShaIntoAst(ast: unknown, commitSha: string | null): void {
  if (!commitSha || !ast) {
    return;
  }

  try {
    const findFrontmatterNode = (node: any): any => {
      if (node?.type === "yaml") {
        return node;
      }
      if (node?.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const result = findFrontmatterNode(child);
          if (result) return result;
        }
      }
      return null;
    };

    const frontmatterNode = findFrontmatterNode(ast);
    if (frontmatterNode && frontmatterNode.value) {
      const currentFrontmatter = yamlParse(frontmatterNode.value) || {};

      const updatedFrontmatter = {
        ...currentFrontmatter,
        agentmark_meta: {
          ...(currentFrontmatter as any)?.agentmark_meta,
          commit_sha: commitSha,
        },
      };

      frontmatterNode.value = yamlStringify(updatedFrontmatter).trim();
    }
  } catch (error) {
    console.error("Failed to inject commit SHA into AST:", error);
  }
}
