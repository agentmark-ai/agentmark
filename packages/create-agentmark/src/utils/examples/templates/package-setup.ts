import fs from "fs-extra";
import { execSync, execFileSync } from "child_process";
import { getAdapterConfig } from "./adapters.js";

export const setupPackageJson = (targetPath: string = ".") => {
  const packageJsonPath = `${targetPath}/package.json`;

  if (!fs.existsSync(packageJsonPath)) {
    console.log("Creating package.json...");
    execSync("npm init -y", { cwd: targetPath });
  }

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

  pkgJson.scripts = {
    ...pkgJson.scripts,
    "demo": "npx tsx index.ts",
    "dev": devScript,
    "prompt": "agentmark run-prompt",
    "experiment": "agentmark run-experiment",
  };
  fs.writeJsonSync(packageJsonPath, pkgJson, { spaces: 2 });
};

export const installDependencies = (
  modelProvider: string,
  targetPath: string = ".",
  adapter: string = "ai-sdk"
) => {
  console.log("Installing required packages...");
  console.log("This might take a moment...");

  const adapterConfig = getAdapterConfig(adapter, modelProvider);

  try {
    // Install TypeScript, ts-node, CLI, and other dev dependencies
    // CLI needs to be a devDep so dev-entry.ts can import from @agentmark/cli/runner-server
    const devDepsCmd = "npm install --save-dev typescript ts-node @types/node @agentmark/cli --legacy-peer-deps";

    execSync(devDepsCmd, {
      stdio: "inherit",
      cwd: targetPath,
    });

    // Install the common packages
    // SDK is required for both local (connects to agentmark serve) and cloud (connects to API)
    const installArgs = [
      "install",
      "dotenv",
      "@agentmark/prompt-core",
      "@agentmark/sdk",
      adapterConfig.package,
      ...adapterConfig.dependencies,
      "--legacy-peer-deps",
    ];

    execFileSync("npm", installArgs, { stdio: "inherit", cwd: targetPath });

    console.log("Packages installed successfully!");
  } catch (error) {
    console.error("Error installing packages:", error);
    throw new Error(
      "Failed to install required packages. Please check your network connection and try again."
    );
  }
};
