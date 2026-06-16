import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { pinCliInPackageJson } from "../../cli-src/commands/init/pin-cli";

/**
 * `agentmark init` pins `@agentmark-ai/cli` into the project so CI and
 * teammates run the same version without a global install (npm resolves
 * node_modules/.bin before PATH). The two edits are non-destructive: never
 * override an existing pin, never clobber an existing script key.
 */
describe("pinCliInPackageJson", () => {
  let tmp: string;
  const pkgPath = () => path.join(tmp, "package.json");

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentmark-pin-"));
  });

  afterEach(() => {
    fs.removeSync(tmp);
  });

  it("returns null and writes nothing when there is no package.json", () => {
    expect(pinCliInPackageJson(tmp, "0.15.0")).toBeNull();
    expect(fs.existsSync(pkgPath())).toBe(false);
  });

  it("adds the CLI as a caret-ranged devDependency on a bare package.json", () => {
    fs.writeJsonSync(pkgPath(), { name: "host", version: "1.0.0" });

    const result = pinCliInPackageJson(tmp, "0.15.0");

    expect(result?.addedDevDependency).toBe(true);
    expect(result?.cliVersionRange).toBe("^0.15.0");
    const pkg = fs.readJsonSync(pkgPath());
    expect(pkg.devDependencies["@agentmark-ai/cli"]).toBe("^0.15.0");
  });

  it("adds `dev` + namespaced scripts on a project with no scripts", () => {
    fs.writeJsonSync(pkgPath(), { name: "host" });

    const result = pinCliInPackageJson(tmp, "0.15.0");

    expect(result?.addedScripts).toEqual([
      "dev",
      "agentmark:build",
      "agentmark:experiment",
    ]);
    const pkg = fs.readJsonSync(pkgPath());
    expect(pkg.scripts).toEqual({
      dev: "agentmark dev",
      "agentmark:build": "agentmark build",
      "agentmark:experiment": "agentmark run-experiment",
    });
  });

  it("never clobbers an existing `dev` script — uses the namespaced fallback", () => {
    fs.writeJsonSync(pkgPath(), {
      name: "host",
      scripts: { dev: "next dev", build: "next build" },
    });

    const result = pinCliInPackageJson(tmp, "0.15.0");

    const pkg = fs.readJsonSync(pkgPath());
    // The user's `dev`/`build` are untouched...
    expect(pkg.scripts.dev).toBe("next dev");
    expect(pkg.scripts.build).toBe("next build");
    // ...and AgentMark's land under namespaced keys.
    expect(pkg.scripts["agentmark:dev"]).toBe("agentmark dev");
    expect(pkg.scripts["agentmark:build"]).toBe("agentmark build");
    expect(result?.addedScripts).toEqual([
      "agentmark:dev",
      "agentmark:build",
      "agentmark:experiment",
    ]);
  });

  it("preserves an existing CLI pin and does not downgrade it", () => {
    fs.writeJsonSync(pkgPath(), {
      name: "host",
      devDependencies: { "@agentmark-ai/cli": "0.14.0" },
    });

    const result = pinCliInPackageJson(tmp, "0.15.0");

    expect(result?.addedDevDependency).toBe(false);
    expect(result?.cliVersionRange).toBe("0.14.0");
    const pkg = fs.readJsonSync(pkgPath());
    expect(pkg.devDependencies["@agentmark-ai/cli"]).toBe("0.14.0");
  });

  it("treats a CLI listed under dependencies (not devDependencies) as already pinned", () => {
    fs.writeJsonSync(pkgPath(), {
      name: "host",
      dependencies: { "@agentmark-ai/cli": "^0.15.0" },
    });

    const result = pinCliInPackageJson(tmp, "0.16.0");

    expect(result?.addedDevDependency).toBe(false);
    const pkg = fs.readJsonSync(pkgPath());
    expect(pkg.devDependencies).toBeUndefined();
  });

  it("does not re-add a script whose command already exists under another key", () => {
    fs.writeJsonSync(pkgPath(), {
      name: "host",
      scripts: { start: "agentmark dev" }, // same command, different key
    });

    const result = pinCliInPackageJson(tmp, "0.15.0");

    const pkg = fs.readJsonSync(pkgPath());
    // No `dev`/`agentmark:dev` added — the command is already wired as `start`.
    expect(pkg.scripts.dev).toBeUndefined();
    expect(pkg.scripts["agentmark:dev"]).toBeUndefined();
    expect(result?.addedScripts).toEqual(["agentmark:build", "agentmark:experiment"]);
  });

  it("is idempotent: a second run adds nothing and rewrites nothing new", () => {
    fs.writeJsonSync(pkgPath(), { name: "host" });
    pinCliInPackageJson(tmp, "0.15.0");
    const afterFirst = fs.readJsonSync(pkgPath());

    const second = pinCliInPackageJson(tmp, "0.15.0");

    expect(second?.addedDevDependency).toBe(false);
    expect(second?.addedScripts).toEqual([]);
    expect(fs.readJsonSync(pkgPath())).toEqual(afterFirst);
  });
});
