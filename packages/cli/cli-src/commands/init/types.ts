/**
 * Type definitions for the `agentmark init` flow.
 *
 * Pared down from the pre-1.0 surface, which carried PackageManager
 * detection, Python venv detection, file-merge metadata, and adapter
 * selection — all gone with the example-template scaffolders. What
 * remains is exactly what the init flow needs: "is this an existing
 * project?" and "does AgentMark already exist here?"
 */

/** Detected information about the target directory. */
export interface ProjectInfo {
  /**
   * True if the target directory looks like an existing TypeScript or
   * Python project (has `package.json`, `tsconfig.json`, `node_modules`,
   * `pyproject.toml`, `requirements.txt`, `setup.py`, or a venv).
   * Drives whether `git init` runs.
   */
  isExistingProject: boolean;

  /** True if `agentmark.json` is already present at the target root. */
  hasAgentmarkJson: boolean;

  /** True if the `agentmark/` directory already exists at the target root. */
  hasAgentmarkDir: boolean;
}
