import * as fs from "fs-extra";
import * as path from "path";
import { execSync } from "child_process";
import {
  setupPackageJson,
  installDependencies,
  getIndexFileContent,
  getTsConfigContent,
  getEnvFileContent,
  createExamplePrompts,
  getTypesFileContent,
  getVercelWebhookTemplate,
  getCloudflareWebhookTemplate,
  getAWSLambdaWebhookTemplate,
  getAzureFunctionWebhookTemplate,
  getGoogleCloudWebhookTemplate,
  getNetlifyWebhookTemplate,
  getLocalNgrokWebhookTemplate,
  getAgentmarkConfigTemplate,
  getWebhookPackageJsonTemplate,
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

const createWebhookClient = (platform: string, targetPath: string) => {
  console.log(`Creating webhook client for ${platform}...`);
  
  const webhookDir = `${targetPath}/webhook-client`;
  fs.ensureDirSync(webhookDir);

  // Create agentmark configuration file
  fs.writeFileSync(`${webhookDir}/agentmark.ts`, getAgentmarkConfigTemplate());

  // Create platform-specific webhook file and package.json
  let webhookContent = "";
  let fileName = "";
  
  switch (platform) {
    case "vercel":
      webhookContent = getVercelWebhookTemplate();
      fileName = "app/api/webhook/route.ts";
      fs.ensureDirSync(`${webhookDir}/app/api/webhook`);
      // Create Next.js specific files
      fs.writeFileSync(`${webhookDir}/next.config.js`, `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@agentmark/sdk'],
  },
};

module.exports = nextConfig;`);
      break;
    case "cloudflare":
      webhookContent = getCloudflareWebhookTemplate();
      fileName = "src/index.ts";
      fs.ensureDirSync(`${webhookDir}/src`);
      // Create wrangler.toml
      fs.writeFileSync(`${webhookDir}/wrangler.toml`, `name = "agentmark-webhook"
main = "dist/index.js"
compatibility_date = "2024-01-01"

[vars]
AGENTMARK_WEBHOOK_SECRET = "your-webhook-secret-here"`);
      break;
    case "aws-lambda":
      webhookContent = getAWSLambdaWebhookTemplate();
      fileName = "src/index.ts";
      fs.ensureDirSync(`${webhookDir}/src`);
      // Create SAM template
      fs.writeFileSync(`${webhookDir}/template.yaml`, `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: AgentMark Webhook Lambda Function

Resources:
  AgentMarkWebhook:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/
      Handler: index.handler
      Runtime: nodejs20.x
      Events:
        WebhookApi:
          Type: Api
          Properties:
            Path: /webhook
            Method: post
      Environment:
        Variables:
          AGENTMARK_WEBHOOK_SECRET: !Ref WebhookSecret
          AGENTMARK_API_KEY: !Ref AgentMarkApiKey
          AGENTMARK_APP_ID: !Ref AgentMarkAppId

Parameters:
  WebhookSecret:
    Type: String
    Description: AgentMark webhook secret
  AgentMarkApiKey:
    Type: String
    Description: AgentMark API key
  AgentMarkAppId:
    Type: String
    Description: AgentMark App ID`);
      break;
    case "azure":
      webhookContent = getAzureFunctionWebhookTemplate();
      fileName = "webhook/index.ts";
      fs.ensureDirSync(`${webhookDir}/webhook`);
      // Create function.json
      fs.writeFileSync(`${webhookDir}/webhook/function.json`, JSON.stringify({
        bindings: [
          {
            authLevel: "function",
            type: "httpTrigger",
            direction: "in",
            name: "req",
            methods: ["post"]
          },
          {
            type: "http",
            direction: "out",
            name: "res"
          }
        ]
      }, null, 2));
      // Create host.json
      fs.writeFileSync(`${webhookDir}/host.json`, JSON.stringify({
        version: "2.0",
        extensionBundle: {
          id: "Microsoft.Azure.Functions.ExtensionBundle",
          version: "[4.*, 5.0.0)"
        }
      }, null, 2));
      break;
    case "google-cloud":
      webhookContent = getGoogleCloudWebhookTemplate();
      fileName = "src/index.ts";
      fs.ensureDirSync(`${webhookDir}/src`);
      break;
    case "netlify":
      webhookContent = getNetlifyWebhookTemplate();
      fileName = "netlify/functions/webhook.ts";
      fs.ensureDirSync(`${webhookDir}/netlify/functions`);
      // Create netlify.toml
      fs.writeFileSync(`${webhookDir}/netlify.toml`, `[build]
  functions = "netlify/functions"
  
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"`);
      break;
    case "local":
      webhookContent = getLocalNgrokWebhookTemplate();
      fileName = "src/webhook.ts";
      fs.ensureDirSync(`${webhookDir}/src`);
      break;
    default:
      console.warn(`Unknown platform: ${platform}`);
      return;
  }

  // Write the webhook file
  fs.writeFileSync(`${webhookDir}/${fileName}`, webhookContent);

  // Create package.json for the webhook client
  fs.writeJSONSync(`${webhookDir}/package.json`, getWebhookPackageJsonTemplate(platform), { spaces: 2 });

  // Create TypeScript config
  fs.writeJSONSync(`${webhookDir}/tsconfig.json`, {
    compilerOptions: {
      target: "ES2020",
      module: "commonjs",
      lib: ["ES2020"],
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      moduleResolution: "node",
      resolveJsonModule: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true
    },
    include: ["src/**/*", "app/**/*", "netlify/**/*", "webhook/**/*"],
    exclude: ["node_modules", "dist"]
  }, { spaces: 2 });

  // Create .env template
  fs.writeFileSync(`${webhookDir}/.env.example`, `# AgentMark Configuration
AGENTMARK_API_KEY=your-api-key-here
AGENTMARK_APP_ID=your-app-id-here
AGENTMARK_WEBHOOK_SECRET=your-webhook-secret-here

# Platform-specific environment variables
# Add any additional variables needed for your chosen platform`);

  console.log(`✅ Webhook client created for ${platform} in ${webhookDir}`);
  console.log(`📝 Remember to:
1. Copy .env.example to .env and fill in your credentials
2. Install dependencies: cd ${webhookDir.replace(targetPath + "/", "")} && npm install
3. Configure your webhook URL in AgentMark Cloud dashboard`);
};

export const createExampleApp = async (
  modelProvider: string,
  model: string,
  target: string = "cloud",
  client: string,
  targetPath: string = ".",
  apiKey: string = "",
  agentmarkApiKey: string = "",
  agentmarkAppId: string = "",
  webhookPlatform: string = ""
) => {
  try {
    console.log("Creating Agent Mark example app...");

    // Create directory structure
    fs.ensureDirSync(`${targetPath}/agentmark`);

    setupMCPServer(client, targetPath);

    // Create example prompts
    createExamplePrompts(model, targetPath);

    // Create types file
    fs.writeFileSync(`${targetPath}/agentmark.types.ts`, getTypesFileContent());

    // Create .env file
    fs.writeFileSync(`${targetPath}/.env`, getEnvFileContent(modelProvider, target, apiKey, agentmarkApiKey, agentmarkAppId));

    // Create the main application file
    fs.writeFileSync(
      `${targetPath}/index.ts`,
      getIndexFileContent(modelProvider, model, target)
    );

    // Create tsconfig.json
    fs.writeJSONSync(`${targetPath}/tsconfig.json`, getTsConfigContent(), { spaces: 2 });

    // Setup package.json and install dependencies
    setupPackageJson(targetPath);
    installDependencies(modelProvider, target, targetPath);

    // Generate webhook client if cloud target and webhook platform is selected
    if (target === "cloud" && webhookPlatform) {
      createWebhookClient(webhookPlatform, targetPath);
    }

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
      console.log(`${folderName !== "." ? "3" : "2"}. Run "npm start" to execute the example`);
      console.log(`${folderName !== "." ? "4" : "3"}. View your evaluations in the AgentMark Cloud dashboard`);
      if (webhookPlatform) {
        console.log(`${folderName !== "." ? "5" : "4"}. Set up your webhook client in the webhook-client folder`);
      }
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
