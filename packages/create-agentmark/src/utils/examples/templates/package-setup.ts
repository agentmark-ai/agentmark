import fs from "fs-extra";
import { execSync, execFileSync } from "child_process";

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

  pkgJson.scripts = {
    ...pkgJson.scripts,
    "demo": "npx tsx index.ts",
    "dev": "agentmark dev",
    "prompt": "agentmark run-prompt",
    "experiment": "agentmark run-experiment",
  };
  fs.writeJsonSync(packageJsonPath, pkgJson, { spaces: 2 });
};

export const installDependencies = (
  modelProvider: string,
  targetPath: string = "."
) => {
  console.log("Installing required packages...");
  console.log("This might take a moment...");

  try {
    // Install TypeScript, ts-node, CLI, and other dev dependencies
    // CLI needs to be a devDep so dev-entry.ts can import from @agentmark/cli/runner-server
    execSync("npm install --save-dev typescript ts-node @types/node @agentmark/cli", {
      stdio: "inherit",
      cwd: targetPath,
    });

    // Install the common packages
    // Use different package names for different providers
    // Pin required major versions: ai@v4, @ai-sdk/<provider>@v1
    const providerPackage = modelProvider === "ollama" ? "ollama-ai-provider" : `@ai-sdk/${modelProvider}@^1`;
    // SDK is required for both local (connects to agentmark serve) and cloud (connects to API)
    const installArgs = [
      "install",
      "dotenv",
      "@agentmark/prompt-core",
      "@agentmark/vercel-ai-v4-adapter",
      "@agentmark/sdk",
      providerPackage,
      "ai@^4",
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
