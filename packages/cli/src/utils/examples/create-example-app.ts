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
  editor: string
) => {
  try {
    console.log("Creating Agent Mark example app...");

    // Create directory structure
    fs.ensureDirSync("./agentmark");

    addRules(editor);

    // Create example prompts
    createExamplePrompts(model);

    if (shouldCreateExample) {
      // Create types file
      fs.writeFileSync("./agentmark.types.ts", getTypesFileContent());

      // Create .env file
      fs.writeFileSync("./.env", getEnvFileContent(modelProvider, useCloud));

      // Create the main application file
      fs.writeFileSync(
        "./index.ts",
        getIndexFileContent(modelProvider, model, useCloud)
      );

      // Create tsconfig.json
      fs.writeJSONSync("./tsconfig.json", getTsConfigContent(), { spaces: 2 });

      // Setup package.json and install dependencies
      setupPackageJson();
      installDependencies(modelProvider, useCloud);
    }

    // Success message
    console.log("\n✅ Agentmark initialization completed successfully!");
    console.log("To get started:");

    if (useCloud === "cloud") {
      console.log(
        "1. Update the .env file with your AgentMark Cloud and API credentials"
      );
      console.log('2. Run "npm start" to execute the example');
      console.log("3. View your evaluations in the AgentMark Cloud dashboard");
    } else {
      console.log("1. Update the .env file with your API credentials");
      console.log(
        '2. Run "npm start" to execute the example and see the results locally'
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
