import * as fs from "fs-extra";
import { execSync } from "child_process";

export const setupPackageJson = (targetPath: string = ".") => {
  const packageJsonPath = `${targetPath}/package.json`;

  if (!fs.existsSync(packageJsonPath)) {
    console.log("Creating package.json...");
    execSync("npm init -y", { cwd: targetPath });
  }

  // Update the created package.json with additional information
  const pkgJson = fs.readJSONSync(packageJsonPath);
  pkgJson.name =
    pkgJson.name === "test" || !pkgJson.name
      ? "agentmark-example-app"
      : pkgJson.name;
  pkgJson.description =
    pkgJson.description || "A simple Node.js app using the Agentmark SDK";
  pkgJson.scripts = {
    ...pkgJson.scripts,
    start: "ts-node index.ts",
  };
  fs.writeJSONSync(packageJsonPath, pkgJson, { spaces: 2 });
};

export const installDependencies = (
  modelProvider: string,
  useCloud: string = "cloud",
  targetPath: string = "."
) => {
  console.log("Installing required packages...");
  console.log("This might take a moment...");

  try {
    // Install TypeScript and ts-node for development
    execSync("npm install --save-dev typescript ts-node @types/node", {
      stdio: "inherit",
      cwd: targetPath,
    });

    // Install the common packages
    let installCmd = `npm install dotenv @agentmark/agentmark-core @agentmark/vercel-ai-v4-adapter @ai-sdk/${modelProvider} ai`;

    // Add the AgentMark SDK only if cloud integration is selected
    if (useCloud === "cloud") {
      installCmd += " @agentmark/sdk";
    }

    execSync(installCmd, { stdio: "inherit", cwd: targetPath });

    console.log("Packages installed successfully!");
  } catch (error) {
    console.error("Error installing packages:", error);
    throw new Error(
      "Failed to install required packages. Please check your network connection and try again."
    );
  }
};
