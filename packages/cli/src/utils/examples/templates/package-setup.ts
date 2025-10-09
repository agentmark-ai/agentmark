import * as fs from "fs-extra";
import { execSync } from "child_process";

export const setupPackageJson = (targetPath: string = ".", target?: string) => {
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
  
  // Create different npm scripts based on target
  if (target === "cloud") {
    pkgJson.scripts = {
      ...pkgJson.scripts,
      "agentmark:example-trace": "ts-node index.ts",
      "agentmark:serve-cloud": "agentmark serve",
      "dev": "PORT=9418 agentmark serve & npx ts-node agentmark.config.ts",
    };
  } else {
    pkgJson.scripts = {
      ...pkgJson.scripts,
      start: "ts-node index.ts",
      "dev": "npx ts-node agentmark.config.ts",
    };
  }
  fs.writeJSONSync(packageJsonPath, pkgJson, { spaces: 2 });
};

export const installDependencies = (
  modelProvider: string,
  target: string = "cloud",
  targetPath: string = "."
) => {
  console.log("Installing required packages...");
  console.log("This might take a moment...");

  try {
    // Install TypeScript, ts-node, express (and types) for development
    execSync("npm install --save-dev typescript ts-node @types/node express @types/express", {
      stdio: "inherit",
      cwd: targetPath,
    });

    // Install the common packages
    // Use different package names for different providers
    // Pin required major versions: ai@v4, @ai-sdk/<provider>@v1
    const providerPackage = modelProvider === "ollama" ? "ollama-ai-provider" : `@ai-sdk/${modelProvider}@^1`;
    let installCmd = `npm install dotenv @agentmark/agentmark-core @agentmark/vercel-ai-v4-adapter ${providerPackage} ai@^4`;

    // Add the Cloud specific packages
    if (target === "cloud") {
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
