import * as fs from "fs-extra";
import * as path from "path";
import {
  setupPackageJson,
  installDependencies,
  getIndexFileContent,
  getTsConfigContent,
  getEnvFileContent,
  createExamplePrompts,
  getTypesFileContent,
} from "./templates";
import { addRules } from "./add-rules";

export const createExampleApp = async (
  modelProvider: string,
  model: string,
  useCloud: string = "cloud",
  shouldCreateExample: boolean = true,
  editor: string,
  targetPath: string = "."
) => {
  try {
    console.log("Creating Agent Mark example app...");

    // Create directory structure
    fs.ensureDirSync(`${targetPath}/agentmark`);

    addRules(editor, targetPath);

    // Create example prompts
    createExamplePrompts(model, targetPath);

    if (shouldCreateExample) {
      // Create types file
      fs.writeFileSync(`${targetPath}/agentmark.types.ts`, getTypesFileContent());

      // Create .env file
      fs.writeFileSync(`${targetPath}/.env`, getEnvFileContent(modelProvider, useCloud));

      // Create the main application file
      fs.writeFileSync(
        `${targetPath}/index.ts`,
        getIndexFileContent(modelProvider, model, useCloud)
      );

      // Create tsconfig.json
      fs.writeJSONSync(`${targetPath}/tsconfig.json`, getTsConfigContent(), { spaces: 2 });

      // Setup package.json and install dependencies
      setupPackageJson(targetPath);
      installDependencies(modelProvider, useCloud, targetPath);
    }

    // Success message
    console.log("\n✅ Agentmark initialization completed successfully!");
    console.log("To get started:");

    const folderName = targetPath.replace("./", "");
    if (folderName !== ".") {
      console.log(`1. Navigate to your project folder: cd ${folderName}`);
    }

    if (useCloud === "cloud") {
      console.log(
        `${folderName !== "." ? "2" : "1"}. Update the .env file with your AgentMark Cloud and API credentials`
      );
      console.log(`${folderName !== "." ? "3" : "2"}. Run "npm start" to execute the example`);
      console.log(`${folderName !== "." ? "4" : "3"}. View your evaluations in the AgentMark Cloud dashboard`);
    } else {
      console.log(`${folderName !== "." ? "2" : "1"}. Update the .env file with your API credentials`);
      console.log(
        `${folderName !== "." ? "3" : "2"}. Run "npm start" to execute the example and see the results locally`
      );
    }

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
