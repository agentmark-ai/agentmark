import * as fs from "fs-extra";
import * as path from "path";
import { execSync } from "child_process";
import { Providers } from "../providers";
import {
  setupPackageJson,
  installDependencies,
  getIndexFileContent,
  getTsConfigContent,
  getEnvFileContent,
  createExamplePrompts,
  getTypesFileContent,
  getClientConfigContent,
  getRunnerFileContent,
} from "./templates";

const setupMCPServer = (client: string, targetPath: string) => {
  if (client === "skip") {
    console.log("Skipping MCP server setup.");
    return;
  }

  try {
    const folderName = targetPath.replace("./", "");
    console.log(`Setting up MCP server for ${client} in ${folderName}...`);
    execSync(`npx mint-mcp add docs.agentmark.co --client ${client}`, {
      stdio: "inherit",
      cwd: targetPath,
    });
    console.log(`✅ MCP server configured for ${client} in ${folderName}`);
  } catch (error) {
    console.warn(`Warning: Could not set up MCP server for ${client}:`, error);
    const folderName = targetPath.replace("./", "");
    console.log("You can manually set it up later by running this command in your project folder:");
    console.log(`cd ${folderName}`);
    console.log(`npx mint-mcp add docs.agentmark.co --client ${client}`);
  }
};

export const createExampleApp = async (
  modelProvider: string,
  model: string,
  target: string = "cloud",
  client: string,
  targetPath: string = ".",
  apiKey: string = "",
  agentmarkApiKey: string = "",
  agentmarkAppId: string = ""
) => {
  try {
    console.log("Creating Agent Mark example app...");

    // Create directory structure
    fs.ensureDirSync(`${targetPath}/agentmark`);

    setupMCPServer(client, targetPath);

    // Create example prompts
    createExamplePrompts(model, targetPath);

    // Create user client config at project root
    // Prefer TS for dev ergonomics
    const langModels = Providers[modelProvider as keyof typeof Providers].languageModels.slice(0, 1);
    fs.writeFileSync(`${targetPath}/agentmark.config.ts`, getClientConfigContent({ defaultRootDir: `./agentmark`, provider: modelProvider, languageModels: langModels }));

    // Create a runner that imports the client and constructs adapter runner
    fs.writeFileSync(`${targetPath}/agentmark.runner.ts`, getRunnerFileContent());

    // Create types file
    fs.writeFileSync(`${targetPath}/agentmark.types.ts`, getTypesFileContent());

    // Create .env file
    fs.writeFileSync(`${targetPath}/.env`, getEnvFileContent(modelProvider, target, apiKey, agentmarkApiKey, agentmarkAppId));

    // Create .gitignore
    const gitignore = ['node_modules', '.env', 'agentmark-output'].join('\n');
    fs.writeFileSync(`${targetPath}/.gitignore`, gitignore);

    // Create the main application file
    fs.writeFileSync(
      `${targetPath}/index.ts`,
      getIndexFileContent(modelProvider, model, target)
    );

    // Create tsconfig.json
    fs.writeJSONSync(`${targetPath}/tsconfig.json`, getTsConfigContent(), { spaces: 2 });

    // Setup package.json and install dependencies
    setupPackageJson(targetPath, target);
    installDependencies(modelProvider, target, targetPath);

    // Success message
    console.log("\n✅ Agentmark initialization completed successfully!");
    console.log("To get started:");

    const folderName = targetPath.replace("./", "");
    if (folderName !== ".") {
      console.log(`1. Navigate to your project folder: cd ${folderName}`);
    }

    if (target === "cloud") {
      console.log(
        `${folderName !== "." ? "2" : "1"}. Update the .env file with your AgentMark Cloud and API credentials`
      );
      console.log(`${folderName !== "." ? "3" : "2"}. Run "npm run agentmark:example-trace" to execute an example`);
      console.log(`${folderName !== "." ? "4" : "3"}. View your traces in the AgentMark Cloud dashboard`);
    } else {
      console.log(`${folderName !== "." ? "2" : "1"}. Update the .env file with your API credentials`);
      console.log(
        `${folderName !== "." ? "3" : "2"}. Run "npm start" to execute the example and see the results locally`
      );
    }

    console.log(`
      NOTE: You can also test your prompts locally using our CLI: "npx @agentmark/cli run-prompt agentmark/customer-support.prompt.mdx"
    `)


    console.log(
      `
 █████╗  ██████╗ ███████╗███╗   ██╗████████╗███╗   ███╗ █████╗ ██████╗ ██╗  ██╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██╔████╔██║███████║██████╔╝█████╔╝ 
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗ 
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
                                                                               
    `
    );
  } catch (error) {
    console.error("Error creating example app:", error);
    throw error;
  }
};
