import fs from "fs-extra";
import { execSync, execFileSync } from "child_process";
import { getAdapterConfig } from "./adapters.js";
import { mergePackageJson } from "../../file-merge.js";
import type { ProjectInfo, ConflictResolution, PackageManagerConfig } from "../../types.js";

export const setupPackageJson = (
  targetPath: string = ".",
  deploymentMode: "cloud" | "static" = "cloud",
  projectInfo: ProjectInfo | null = null,
  _resolutions: ConflictResolution[] = []
) => {
  const packageJsonPath = `${targetPath}/package.json`;
  const isExistingProject = projectInfo?.isExistingProject ?? false;

  if (!fs.existsSync(packageJsonPath)) {
    console.log("Creating package.json...");
    execSync("npm init -y", { cwd: targetPath });
  }

  // For existing projects, use merge logic
  if (isExistingProject && fs.existsSync(packageJsonPath)) {
    // Build scripts to add - with namespacing for conflicts
    const scriptsToAdd: Record<string, string> = {
      "demo": "npx tsx index.ts",
      "dev": "agentmark dev",
      "prompt": "agentmark run-prompt",
      "experiment": "agentmark run-experiment",
    };

    if (deploymentMode === "static") {
      scriptsToAdd["build"] = "agentmark build --out dist/agentmark";
    }

    // Use mergePackageJson for existing projects
    const result = mergePackageJson(targetPath, {}, {}, scriptsToAdd);

    if (result.added.length > 0) {
      console.log(`✅ Added to package.json: ${result.added.join(', ')}`);
    }
    if (result.skipped.length > 0) {
      console.log(`⏭️  Skipped existing in package.json: ${result.skipped.join(', ')}`);
    }
    if (result.warnings.length > 0) {
      result.warnings.forEach((w) => console.log(`⚠️  ${w}`));
    }
  } else {
    // Update the created package.json with additional information
    const pkgJson = fs.readJsonSync(packageJsonPath);
    pkgJson.name =
      pkgJson.name === "test" || !pkgJson.name
        ? "agentmark-example-app"
        : pkgJson.name;
    pkgJson.description =
      pkgJson.description || "A simple Node.js app using the Agentmark SDK";

    // All platforms use "agentmark dev" which runs their respective dev-entry.ts
    const devScript = "agentmark dev";

    // Base scripts for all modes
    const scripts: Record<string, string> = {
      ...pkgJson.scripts,
      "demo": "npx tsx index.ts",
      "dev": devScript,
      "prompt": "agentmark run-prompt",
      "experiment": "agentmark run-experiment",
    };

    // For static/self-hosted mode, add the build script
    if (deploymentMode === "static") {
      scripts["build"] = "agentmark build --out dist/agentmark";
    }

    pkgJson.scripts = scripts;

    // Add overrides to fix vulnerabilities in transitive dependencies
    // localtunnel (used by @agentmark-ai/cli) depends on axios@0.21.4 which has vulnerabilities
    pkgJson.overrides = {
      ...pkgJson.overrides,
      "axios": "^1.7.9"
    };

    fs.writeJsonSync(packageJsonPath, pkgJson, { spaces: 2 });
  }
};

export const installDependencies = (
  modelProvider: string,
  targetPath: string = ".",
  adapter: string = "ai-sdk",
  deploymentMode: "cloud" | "static" = "cloud",
  packageManager: PackageManagerConfig | null = null
) => {
  console.log("Installing required packages...");
  console.log("This might take a moment...");

  const adapterConfig = getAdapterConfig(adapter, modelProvider);

  // Use detected package manager or default to npm
  const pm = packageManager || { name: 'npm', installCmd: 'npm install', addCmd: 'npm install', addDevCmd: 'npm install --save-dev', lockFile: 'package-lock.json' };
  const pmName = pm.name;

  try {
    // Dev dependencies to install
    const devDeps = ['typescript', 'ts-node', '@types/node', '@agentmark-ai/cli'];

    // Install dev dependencies using detected package manager
    let devDepsCmd: string;
    if (pmName === 'npm') {
      devDepsCmd = `npm install --save-dev ${devDeps.join(' ')} --legacy-peer-deps`;
    } else if (pmName === 'yarn') {
      devDepsCmd = `yarn add --dev ${devDeps.join(' ')}`;
    } else if (pmName === 'pnpm') {
      devDepsCmd = `pnpm add --save-dev ${devDeps.join(' ')}`;
    } else if (pmName === 'bun') {
      devDepsCmd = `bun add --dev ${devDeps.join(' ')}`;
    } else {
      devDepsCmd = `npm install --save-dev ${devDeps.join(' ')} --legacy-peer-deps`;
    }

    console.log(`Using ${pmName} to install dependencies...`);

    execSync(devDepsCmd, {
      stdio: "inherit",
      cwd: targetPath,
    });

    // Install the common packages
    // SDK is required for both local (connects to agentmark serve) and cloud (connects to API)
    // Loader packages are imported directly - ApiLoader always needed, FileLoader only for static mode
    const loaderPackages = deploymentMode === "static"
      ? ["@agentmark-ai/loader-api", "@agentmark-ai/loader-file"]
      : ["@agentmark-ai/loader-api"];

    const deps = [
      "dotenv",
      "@agentmark-ai/prompt-core",
      "@agentmark-ai/sdk",
      adapterConfig.package,
      ...loaderPackages,
      ...adapterConfig.dependencies,
    ];

    // Install regular dependencies using detected package manager
    let depsCmd: string;
    if (pmName === 'npm') {
      depsCmd = `npm install ${deps.join(' ')} --legacy-peer-deps`;
    } else if (pmName === 'yarn') {
      depsCmd = `yarn add ${deps.join(' ')}`;
    } else if (pmName === 'pnpm') {
      depsCmd = `pnpm add ${deps.join(' ')}`;
    } else if (pmName === 'bun') {
      depsCmd = `bun add ${deps.join(' ')}`;
    } else {
      depsCmd = `npm install ${deps.join(' ')} --legacy-peer-deps`;
    }

    execSync(depsCmd, { stdio: "inherit", cwd: targetPath });

    console.log("Packages installed successfully!");
  } catch (error) {
    console.error("Error installing packages:", error);
    throw new Error(
      "Failed to install required packages. Please check your network connection and try again."
    );
  }
};
