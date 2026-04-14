import fs from "fs-extra";
import * as path from "path";
import {
  createExamplePrompts,
} from "./templates/index.js";
import { appendGitignore, appendEnv } from "../file-merge.js";
import { shouldMergeFile } from "../conflict-resolution.js";
import type { ProjectInfo, ConflictResolution } from "../types.js";

const setupMCPServer = (client: string, targetPath: string) => {
  if (client === "skip") {
    console.log("Skipping MCP server setup.");
    return;
  }

  const folderName = targetPath;

  // Handle VS Code
  if (client === "vscode") {
    try {
      console.log(`Setting up MCP server for VS Code in ${folderName}...`);
      const vscodeDir = path.join(targetPath, ".vscode");
      fs.ensureDirSync(vscodeDir);

      const mcpConfig = {
        servers: {
          "agentmark-docs": {
            url: "https://docs.agentmark.co/mcp"
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
          }
        }
      };

      fs.writeJsonSync(path.join(vscodeDir, "mcp.json"), mcpConfig, { spaces: 2 });
      console.log(`MCP server configured for VS Code in ${folderName}/.vscode/mcp.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for VS Code:`, error);
    }
    return;
  }

  // Handle Zed
  if (client === "zed") {
    try {
      console.log(`Setting up MCP server for Zed in ${folderName}...`);
      const zedDir = path.join(targetPath, ".zed");
      fs.ensureDirSync(zedDir);

      const zedConfig = {
        context_servers: {
          "agentmark-docs": {
            url: "https://docs.agentmark.co/mcp"
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
          }
        }
      };

      fs.writeJsonSync(path.join(zedDir, "settings.json"), zedConfig, { spaces: 2 });
      console.log(`MCP server configured for Zed in ${folderName}/.zed/settings.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for Zed:`, error);
    }
    return;
  }

  // Handle Cursor
  if (client === "cursor") {
    try {
      console.log(`Setting up MCP server for Cursor in ${folderName}...`);
      const cursorDir = path.join(targetPath, ".cursor");
      fs.ensureDirSync(cursorDir);

      const cursorConfig = {
        mcpServers: {
          "agentmark-docs": {
            url: "https://docs.agentmark.co/mcp"
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
          }
        }
      };

      fs.writeJsonSync(path.join(cursorDir, "mcp.json"), cursorConfig, { spaces: 2 });
      console.log(`MCP server configured for Cursor in ${folderName}/.cursor/mcp.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for Cursor:`, error);
    }
    return;
  }

  // Handle Claude Code
  if (client === "claude-code") {
    try {
      console.log(`Setting up MCP server for Claude Code in ${folderName}...`);

      const mcpConfig = {
        mcpServers: {
          "agentmark-docs": {
            type: "http",
            url: "https://docs.agentmark.co/mcp"
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
          }
        }
      };

      fs.writeJsonSync(path.join(targetPath, ".mcp.json"), mcpConfig, { spaces: 2 });
      console.log(`MCP server configured for Claude Code in ${folderName}/.mcp.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for Claude Code:`, error);
    }
    return;
  }
};

const getPyprojectContent = (projectName: string, adapter: string): string => {
  if (adapter === "claude-agent-sdk") {
    return `[project]
name = "${projectName}"
version = "0.1.0"
description = "An AgentMark application using Claude Agent SDK"
requires-python = ">=3.12"
dependencies = [
    "agentmark-sdk>=0.1.0",
    "agentmark-claude-agent-sdk-v0>=0.1.0",
    "agentmark-prompt-core>=0.1.0",
    "python-dotenv>=1.0.0",
    "claude-agent-sdk>=0.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-asyncio>=0.21",
    "mypy>=1.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
asyncio_mode = "auto"

[tool.mypy]
strict = true
`;
  }

  // Default: pydantic-ai
  return `[project]
name = "${projectName}"
version = "0.1.0"
description = "An AgentMark application using Pydantic AI"
requires-python = ">=3.12"
dependencies = [
    "agentmark-sdk>=0.1.0",
    "agentmark-pydantic-ai-v0>=0.1.0",
    "agentmark-prompt-core>=0.1.0",
    "python-dotenv>=1.0.0",
    "pydantic-ai[openai]>=0.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-asyncio>=0.21",
    "mypy>=1.0",
]
anthropic = ["pydantic-ai[anthropic]"]
gemini = ["pydantic-ai[gemini]"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
asyncio_mode = "auto"

[tool.mypy]
strict = true
`;
};

const getHandlerPyContent = (adapter: string): string => {
  const webhookClass = adapter === "claude-agent-sdk"
    ? "ClaudeAgentSDKWebhookHandler"
    : "PydanticAIWebhookHandler";
  const webhookImport = adapter === "claude-agent-sdk"
    ? "from agentmark_claude_agent_sdk import ClaudeAgentSDKWebhookHandler"
    : "from agentmark_pydantic_ai_v0 import PydanticAIWebhookHandler";

  return `"""AgentMark handler for managed cloud deployments.

This file is used by the AgentMark platform to execute prompts and experiments
on deployed infrastructure. It mirrors the TypeScript handler.ts pattern.
"""

import os

from agentmark_sdk import AgentMarkSDK
${webhookImport}
from agentmark_client import client

# Initialize tracing
sdk = AgentMarkSDK(
    api_key=os.environ.get("AGENTMARK_API_KEY", ""),
    app_id=os.environ.get("AGENTMARK_APP_ID", ""),
    base_url=os.environ.get("AGENTMARK_BASE_URL"),
)
sdk.init_tracing(disable_batch=True)

adapter = ${webhookClass}(client)


async def handler(request: dict):
    """Handle prompt-run and dataset-run requests from the platform."""
    req_type = request.get("type")
    data = request.get("data", {})

    if req_type == "prompt-run":
        return await adapter.run_prompt(data["ast"], {
            "shouldStream": data.get("options", {}).get("shouldStream", True),
            "customProps": data.get("customProps"),
        })

    if req_type == "dataset-run":
        return await adapter.run_experiment(
            data["ast"],
            data.get("experimentId", ""),
            data.get("datasetPath"),
        )

    raise ValueError(f"Unknown request type: {req_type}")
`;
};

const getAgentmarkClientContent = (deploymentMode: "cloud" | "static", adapter: string): string => {
  const isCloud = deploymentMode === "cloud";
  const loaderImport = isCloud
    ? `from agentmark.prompt_core import ApiLoader`
    : `from agentmark.prompt_core import FileLoader`;
  const loaderSetup = isCloud
    ? `# API loader for cloud deployment — fetches datasets from the AgentMark gateway
loader = ApiLoader.cloud()`
    : `# File loader for local development
project_root = Path(__file__).parent.resolve()
loader = FileLoader(base_dir=str(project_root))`;

  if (adapter === "claude-agent-sdk") {
    return `"""AgentMark client configuration.

This file configures the AgentMark client with Claude Agent SDK adapter.
Customize the model registry and eval registry as needed.
"""

import json
import os
from pathlib import Path
from dotenv import load_dotenv

${loaderImport}
from agentmark.prompt_core import EvalRegistry
from agentmark_claude_agent_sdk import (
    create_claude_agent_client,
    ClaudeAgentModelRegistry,
)

# Load environment variables
load_dotenv()

# Register the model providers your prompts use.
# This maps "anthropic/claude-sonnet-4-20250514" in prompt files to the Claude Agent SDK.
model_registry = ClaudeAgentModelRegistry()
model_registry.register_providers({
    "anthropic": "anthropic",
})


# Evaluation functions — used by experiments to score model outputs
def exact_match_json(params):
    """Check if output matches expected output exactly."""
    output = params.get("output")
    expected_output = params.get("expectedOutput")
    if not expected_output:
        return {"score": 0, "label": "error", "reason": "No expected output provided", "passed": False}
    try:
        actual = json.loads(output) if isinstance(output, str) else output
        expected = json.loads(expected_output) if isinstance(expected_output, str) else expected_output
        ok = actual == expected
        return {
            "score": 1 if ok else 0,
            "label": "correct" if ok else "incorrect",
            "reason": "Exact match" if ok else "Mismatch",
            "passed": ok,
        }
    except (json.JSONDecodeError, TypeError):
        return {"score": 0, "label": "error", "reason": "Failed to parse JSON", "passed": False}

evals: EvalRegistry = {
    "exact_match_json": exact_match_json,
}

${loaderSetup}

# Create the client
# Claude Agent SDK handles tools natively through the SDK
client = create_claude_agent_client(
    model_registry=model_registry,
    evals=evals,
    loader=loader,
)

__all__ = ["client"]
`;
  }

  // Default: pydantic-ai
  return `"""AgentMark client configuration.

This file configures the AgentMark client with Pydantic AI adapter.
Customize the model registry, tools, and eval registry as needed.
"""

import json
import os
from pathlib import Path
from dotenv import load_dotenv

${loaderImport}
from agentmark.prompt_core import EvalRegistry
from agentmark_pydantic_ai_v0 import (
    create_pydantic_ai_client,
    PydanticAIModelRegistry,
)

# Load environment variables
load_dotenv()

# Register the model providers your prompts use.
# This maps "openai/gpt-4o" in prompt files to "openai:gpt-4o" for Pydantic AI.
model_registry = PydanticAIModelRegistry()
model_registry.register_providers({
    "openai": "openai",
    "anthropic": "anthropic",
})

# Define tools as native pydantic-ai Tool objects or callables
# Example:
# def search(query: str) -> str:
#     return f"Search results for: {query}"
# tools = [search]
tools = []


# Evaluation functions — used by experiments to score model outputs
def exact_match_json(params):
    """Check if output matches expected output exactly."""
    output = params.get("output")
    expected_output = params.get("expectedOutput")
    if not expected_output:
        return {"score": 0, "label": "error", "reason": "No expected output provided", "passed": False}
    try:
        actual = json.loads(output) if isinstance(output, str) else output
        expected = json.loads(expected_output) if isinstance(expected_output, str) else expected_output
        ok = actual == expected
        return {
            "score": 1 if ok else 0,
            "label": "correct" if ok else "incorrect",
            "reason": "Exact match" if ok else "Mismatch",
            "passed": ok,
        }
    except (json.JSONDecodeError, TypeError):
        return {"score": 0, "label": "error", "reason": "Failed to parse JSON", "passed": False}

evals: EvalRegistry = {
    "exact_match_json": exact_match_json,
}

${loaderSetup}

# Create the client
client = create_pydantic_ai_client(
    model_registry=model_registry,
    tools=tools,
    evals=evals,
    loader=loader,
)

__all__ = ["client"]
`;
};

export const getMainPyContent = (adapter: string, deploymentMode: "cloud" | "static" = "cloud"): string => {
  const isCloud = deploymentMode === "cloud";

  const cloudTracingInit = `
# Initialize tracing - traces will be sent to AgentMark Cloud
# To disable tracing, comment out sdk.init_tracing() below
sdk = AgentMarkSDK(
    api_key=os.environ.get("AGENTMARK_API_KEY", ""),
    app_id=os.environ.get("AGENTMARK_APP_ID", ""),
)
sdk.init_tracing(disable_batch=True)
`;

  const staticTracingInit = `
# Initialize tracing - traces will be sent to local dev server
# Make sure to run "npm run agentmark dev" in another terminal first
# To disable tracing, comment out sdk.init_tracing() below
sdk = AgentMarkSDK(
    api_key="",
    app_id="",
    base_url="http://localhost:9418",
)
sdk.init_tracing(disable_batch=True)
`;

  const tracingInit = isCloud ? cloudTracingInit : staticTracingInit;

  if (adapter === "claude-agent-sdk") {
    return `"""Example usage of AgentMark with Claude Agent SDK.

Run with: python main.py
"""

import asyncio
import json
import os
from pathlib import Path

from agentmark_sdk import AgentMarkSDK
from agentmark_claude_agent_sdk import run_text_prompt
from agentmark_client import client
${tracingInit}

async def main():
    """Run the party planner prompt."""
    # Load the prompt AST (in production, use the API loader)
    prompt_path = Path("agentmark/party-planner.prompt.mdx.json")

    if not prompt_path.exists():
        print("Prompt file not found. Run 'agentmark build' first.")
        return

    with open(prompt_path) as f:
        ast = json.load(f)

    # Load and format the prompt
    prompt = await client.load_text_prompt(ast)
    params = await prompt.format(props={
        "numberOfGuests": 10,
        "theme": "80s disco",
        "dietaryRestrictions": ["vegetarian", "gluten-free"],
    })

    # Execute the prompt
    print("Running party planner prompt...")
    result = await run_text_prompt(params)

    print("\\n" + "=" * 50)
    print("Party Plan:")
    print("=" * 50)
    print(result.output)
    print("\\n" + "-" * 50)
    print(f"Tokens used: {result.usage}")


if __name__ == "__main__":
    asyncio.run(main())
`;
  }

  // Default: pydantic-ai
  return `"""Example usage of AgentMark with Pydantic AI.

Run with: python main.py
"""

import asyncio
import json
import os
from pathlib import Path

from agentmark_sdk import AgentMarkSDK
from agentmark_pydantic_ai_v0 import run_text_prompt
from agentmark_client import client
${tracingInit}

async def main():
    """Run the party planner prompt."""
    # Load the prompt AST (in production, use the API loader)
    prompt_path = Path("agentmark/party-planner.prompt.mdx.json")

    if not prompt_path.exists():
        print("Prompt file not found. Run 'agentmark build' first.")
        return

    with open(prompt_path) as f:
        ast = json.load(f)

    # Load and format the prompt
    prompt = await client.load_text_prompt(ast)
    params = await prompt.format(props={
        "numberOfGuests": 10,
        "theme": "80s disco",
        "dietaryRestrictions": ["vegetarian", "gluten-free"],
    })

    # Execute the prompt
    print("Running party planner prompt...")
    result = await run_text_prompt(params)

    print("\\n" + "=" * 50)
    print("Party Plan:")
    print("=" * 50)
    print(result.output)
    print("\\n" + "-" * 50)
    print(f"Tokens used: {result.usage.total_tokens}")


if __name__ == "__main__":
    asyncio.run(main())
`;
};

const getDevServerContent = (adapter: string): string => {
  const adapterPackage = adapter === "claude-agent-sdk"
    ? "agentmark_claude_agent_sdk"
    : "agentmark_pydantic_ai_v0";

  return `"""Auto-generated webhook server for AgentMark development.

This server is started by 'npm run agentmark dev' (agentmark dev) and handles
prompt execution requests from the CLI.
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from ${adapterPackage} import create_webhook_server
from agentmark_client import client


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--webhook-port", type=int, default=9417)
    parser.add_argument("--api-server-port", type=int, default=9418)
    args = parser.parse_args()

    create_webhook_server(client, args.webhook_port, args.api_server_port)
`;
};

const getEnvContent = (apiKey: string, adapter: string): string => {
  if (adapter === "claude-agent-sdk") {
    return `# Anthropic API Key
ANTHROPIC_API_KEY=${apiKey}
`;
  }

  // Default: pydantic-ai (OpenAI)
  return `# OpenAI API Key
OPENAI_API_KEY=${apiKey}

# For Anthropic models, add:
# ANTHROPIC_API_KEY=your-key-here

# For Google Gemini models, add:
# GOOGLE_API_KEY=your-key-here
`;
};

const getGitignoreContent = (): string => {
  return `# Python
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
.env

# AgentMark
*.agentmark-outputs/
.agentmark/

# IDE
.idea/
.vscode/
*.swp

# Build
dist/
build/
*.egg-info/

# Testing
.pytest_cache/
.coverage
htmlcov/
`;
};

export const createPythonApp = async (
  client: string,
  targetPath: string = ".",
  apiKey: string = "",
  deploymentMode: "cloud" | "static" = "cloud",
  adapter: string = "pydantic-ai",
  projectInfo: ProjectInfo | null = null,
  resolutions: ConflictResolution[] = []
): Promise<string[]> => {
  try {
    const model = adapter === 'claude-agent-sdk' ? 'anthropic/claude-sonnet-4-20250514' : 'openai/gpt-4o';
    const adapterDisplayName = adapter === 'claude-agent-sdk' ? 'Claude Agent SDK' : 'Pydantic AI';
    const isExistingProject = projectInfo?.isExistingProject ?? false;

    if (isExistingProject) {
      console.log(`Adding AgentMark to existing Python project with ${adapterDisplayName}...`);
    } else {
      console.log(`Creating AgentMark Python app with ${adapterDisplayName}...`);
    }

    const folderName = targetPath;

    // Create directory structure
    fs.ensureDirSync(`${targetPath}/agentmark`);

    setupMCPServer(client, targetPath);

    // Create example prompts (reuse from TypeScript) — returns the model IDs actually written
    const usedModels = createExamplePrompts(model, targetPath, adapter);
    console.log(`Example prompts and datasets created in ${folderName}/agentmark/`);

    // Create pyproject.toml (skip for existing projects)
    if (!isExistingProject) {
      const projectName = path.basename(targetPath).replace(/[^a-zA-Z0-9_-]/g, "-");
      fs.writeFileSync(`${targetPath}/pyproject.toml`, getPyprojectContent(projectName, adapter));
    } else {
      console.log("⏭️  Skipped pyproject.toml (existing project)");
    }

    // Create agentmark_client.py (always create - this is AgentMark-specific)
    fs.writeFileSync(`${targetPath}/agentmark_client.py`, getAgentmarkClientContent(deploymentMode, adapter));

    // Create handler.py for cloud deployments (managed code execution)
    if (deploymentMode === "cloud") {
      const handlerPath = path.join(targetPath, 'handler.py');
      if (fs.existsSync(handlerPath)) {
        console.log("⏭️  Skipped handler.py (already exists - preserving customizations)");
      } else {
        fs.writeFileSync(handlerPath, getHandlerPyContent(adapter));
        console.log(`✅ Created handler.py for cloud deployment`);
      }
    }

    // Create main.py (skip for existing projects)
    if (!isExistingProject) {
      fs.writeFileSync(`${targetPath}/main.py`, getMainPyContent(adapter, deploymentMode));
    } else {
      console.log("⏭️  Skipped main.py (existing project)");
    }

    // Create or append to .env file
    if (shouldMergeFile('.env', projectInfo, resolutions)) {
      const envVars: Record<string, string> = {};
      const apiKeyEnvVar = adapter === 'claude-agent-sdk' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      if (apiKey) {
        envVars[apiKeyEnvVar] = apiKey;
      } else {
        envVars[apiKeyEnvVar] = adapter === 'claude-agent-sdk' ? 'your-anthropic-api-key' : 'your-openai-api-key';
      }
      const result = appendEnv(targetPath, envVars);
      if (result.added.length > 0) {
        console.log(`✅ Added to .env: ${result.added.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        console.log(`⏭️  Skipped existing .env vars: ${result.skipped.join(', ')}`);
      }
    } else {
      fs.writeFileSync(`${targetPath}/.env`, getEnvContent(apiKey, adapter));
    }

    // Create or append to .gitignore
    const gitignoreEntries = [
      '__pycache__/', '*.py[cod]', '*$py.class', '.venv/', 'venv/', '.env',
      '*.agentmark-outputs/', '.agentmark/', '.idea/', '.vscode/', '*.swp',
      'dist/', 'build/', '*.egg-info/', '.pytest_cache/', '.coverage', 'htmlcov/'
    ];
    if (shouldMergeFile('.gitignore', projectInfo, resolutions)) {
      const result = appendGitignore(targetPath, gitignoreEntries);
      if (result.added.length > 0) {
        console.log(`✅ Added to .gitignore: ${result.added.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        console.log(`⏭️  Already in .gitignore: ${result.skipped.join(', ')}`);
      }
    } else {
      fs.writeFileSync(`${targetPath}/.gitignore`, getGitignoreContent());
    }

    // Create .agentmark directory with dev_server.py
    const agentmarkInternalDir = path.join(targetPath, '.agentmark');
    fs.ensureDirSync(agentmarkInternalDir);
    fs.writeFileSync(path.join(agentmarkInternalDir, 'dev_server.py'), getDevServerContent(adapter));

    // Python environment setup notes
    const pythonVenv = projectInfo?.pythonVenv;
    if (pythonVenv) {
      console.log(`\n📦 Detected existing Python venv: ${pythonVenv.name}`);
      console.log("   Remember to activate it before running AgentMark commands.");
    } else if (!isExistingProject) {
      console.log("Setting up Python environment...");
      console.log("Note: You'll need to set up a virtual environment and install dependencies.");
      console.log("");
    }

    // Success message
    console.log("\n✅ AgentMark Python initialization completed successfully!");

    console.log(
      `
 ██████╗ ██╗   ██╗████████╗██╗  ██╗ ██████╗ ███╗   ██╗
 ██╔══██╗╚██╗ ██╔╝╚══██╔══╝██║  ██║██╔═══██╗████╗  ██║
 ██████╔╝ ╚████╔╝    ██║   ███████║██║   ██║██╔██╗ ██║
 ██╔═══╝   ╚██╔╝     ██║   ██╔══██║██║   ██║██║╚██╗██║
 ██║        ██║      ██║   ██║  ██║╚██████╔╝██║ ╚████║
 ╚═╝        ╚═╝      ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
                    + AgentMark
    `
    );

    console.log('\n' + '═'.repeat(70));
    console.log('Next Steps');
    console.log('═'.repeat(70));

    console.log('\n Get Started:');
    if (folderName !== "." && folderName !== "./" && !isExistingProject) {
      console.log(`  $ cd ${folderName}`);
    }

    // Show venv activation or creation based on detection
    if (pythonVenv) {
      const activateCmd = process.platform === 'win32'
        ? `${pythonVenv.name}\\Scripts\\activate`
        : `source ${pythonVenv.name}/bin/activate`;
      console.log(`  $ ${activateCmd}`);
      console.log('  $ pip install agentmark-pydantic-ai-v0 agentmark-prompt-core python-dotenv "pydantic-ai[openai]"');
    } else {
      console.log('  $ python -m venv .venv');
      console.log('  $ source .venv/bin/activate  # On Windows: .venv\\Scripts\\activate');
      console.log('  $ pip install -e ".[dev]"');
    }
    console.log('  $ npm run agentmark dev\n');

    console.log('─'.repeat(70));
    console.log('Resources');
    console.log('─'.repeat(70));
    console.log('  Documentation: https://docs.agentmark.co');
    console.log('═'.repeat(70) + '\n');

    return usedModels;
  } catch (error) {
    console.error("Error creating Python app:", error);
    throw error;
  }
};
