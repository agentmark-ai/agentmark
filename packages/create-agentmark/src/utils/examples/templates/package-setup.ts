import fs from "fs-extra";
import { execSync } from "child_process";

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
    // Install AgentMark CLI globally if not already installed
    try {
      execSync("agentmark --version", { stdio: "ignore" });
      console.log("AgentMark CLI already installed globally");
    } catch {
      console.log("Installing AgentMark CLI globally...");
      execSync("npm install -g @agentmark/cli", { stdio: "inherit" });
      console.log("AgentMark CLI installed successfully!");
    }

    // Install TypeScript, ts-node, express (and types) for development
    execSync("npm install --save-dev typescript ts-node @types/node express @types/express", {
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
      "@agentmark/agentmark-core",
      "@agentmark/vercel-ai-v4-adapter",
      "@agentmark/sdk",
      providerPackage,
      "ai@^4",
    ];

    execSync("npm", installArgs, { stdio: "inherit", cwd: targetPath });

    console.log("Packages installed successfully!");
  } catch (error) {
    console.error("Error installing packages:", error);
    throw new Error(
      "Failed to install required packages. Please check your network connection and try again."
    );
  }
};
