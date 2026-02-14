import { execSync } from "child_process";

/**
 * Initialize a git repository and create an initial commit.
 *
 * Skips silently when:
 * - The target path is already inside a git repository
 * - git is not installed
 * - Any git command fails (non-fatal)
 */
export function initGitRepo(targetPath: string): boolean {
  try {
    // Check if git is available
    try {
      execSync("git --version", { stdio: "ignore" });
    } catch {
      console.log("⚠️  git not found — skipping repository initialization");
      return false;
    }

    // Check if already inside a git repo
    try {
      execSync("git rev-parse --is-inside-work-tree", {
        cwd: targetPath,
        stdio: "ignore",
      });
      // Already in a git repo — skip
      return false;
    } catch {
      // Not in a git repo — proceed
    }

    execSync("git init", { cwd: targetPath, stdio: "ignore" });
    execSync("git add -A", { cwd: targetPath, stdio: "ignore" });
    execSync('git commit -m "Initial commit from create-agentmark"', {
      cwd: targetPath,
      stdio: "ignore",
    });

    console.log("✅ Initialized git repository with initial commit");
    return true;
  } catch {
    console.log("⚠️  Could not initialize git repository");
    return false;
  }
}
