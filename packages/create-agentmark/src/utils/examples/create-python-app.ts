import fs from "fs-extra";
import * as path from "path";
import {
  createExamplePrompts,
} from "./templates/index.js";

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

const getPyprojectContent = (projectName: string): string => {
  return `[project]
name = "${projectName}"
version = "0.1.0"
description = "An AgentMark application using Pydantic AI"
requires-python = ">=3.12"
dependencies = [
    "agentmark-pydantic-ai>=0.1.0",
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

const getAgentmarkClientContent = (_deploymentMode: "cloud" | "static"): string => {
  return `"""AgentMark client configuration.

This file configures the AgentMark client with Pydantic AI adapter.
Customize the model registry and tool registry as needed.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

from agentmark.prompt_core import FileLoader
from agentmark_pydantic_ai_v0 import (
    create_pydantic_ai_client,
    create_default_model_registry,
    PydanticAIToolRegistry,
)

# Load environment variables
load_dotenv()

# Configure model registry with default mappings
# Supports: gpt-*, claude-*, gemini-*, etc.
model_registry = create_default_model_registry()

# Configure tool registry for custom tools
tool_registry = PydanticAIToolRegistry()

# Example tool registration:
# @tool_registry.register("search")
# async def search_web(args: dict, ctx: dict | None) -> str:
#     query = args["query"]
#     return f"Search results for: {query}"

# Create file loader for local development
# Uses the project root as base directory for resolving relative paths
project_root = Path(__file__).parent.resolve()
loader = FileLoader(base_dir=str(project_root))

# Create the client
client = create_pydantic_ai_client(
    model_registry=model_registry,
    tool_registry=tool_registry,
    loader=loader,
)

__all__ = ["client"]
`;
};

const getMainPyContent = (): string => {
  return `"""Example usage of AgentMark with Pydantic AI.

Run with: python main.py
"""

import asyncio
import json
from pathlib import Path

from agentmark_pydantic_ai_v0 import run_text_prompt
from agentmark_client import client


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

const getDevServerContent = (): string => {
  return `"""Auto-generated webhook server for AgentMark development.

This server is started by 'npm run dev' (agentmark dev) and handles
prompt execution requests from the CLI.
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from agentmark_pydantic_ai_v0 import create_webhook_server
from agentmark_client import client


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--webhook-port", type=int, default=9417)
    parser.add_argument("--api-server-port", type=int, default=9418)
    args = parser.parse_args()

    create_webhook_server(client, args.webhook_port, args.api_server_port)
`;
};

const getEnvContent = (apiKey: string): string => {
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
  deploymentMode: "cloud" | "static" = "cloud"
) => {
  try {
    const model = 'gpt-4o';
    console.log("Creating AgentMark Python app with Pydantic AI...");

    const folderName = targetPath;

    // Create directory structure
    fs.ensureDirSync(`${targetPath}/agentmark`);

    setupMCPServer(client, targetPath);

    // Create example prompts (reuse from TypeScript)
    createExamplePrompts(model, targetPath, "pydantic-ai");
    console.log(`Example prompts and datasets created in ${folderName}/agentmark/`);

    // Create pyproject.toml
    const projectName = path.basename(targetPath).replace(/[^a-zA-Z0-9_-]/g, "-");
    fs.writeFileSync(`${targetPath}/pyproject.toml`, getPyprojectContent(projectName));

    // Create agentmark_client.py
    fs.writeFileSync(`${targetPath}/agentmark_client.py`, getAgentmarkClientContent(deploymentMode));

    // Create main.py
    fs.writeFileSync(`${targetPath}/main.py`, getMainPyContent());

    // Create .env file
    fs.writeFileSync(`${targetPath}/.env`, getEnvContent(apiKey));

    // Create .gitignore
    fs.writeFileSync(`${targetPath}/.gitignore`, getGitignoreContent());

    // Create .agentmark directory with dev_server.py
    const agentmarkInternalDir = path.join(targetPath, '.agentmark');
    fs.ensureDirSync(agentmarkInternalDir);
    fs.writeFileSync(path.join(agentmarkInternalDir, 'dev_server.py'), getDevServerContent());

    // Install Python dependencies
    console.log("Setting up Python environment...");
    console.log("Note: You'll need to set up a virtual environment and install dependencies.");
    console.log("");

    // Success message
    console.log("\nAgentMark Python initialization completed successfully!");

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
    if (folderName !== "." && folderName !== "./") {
      console.log(`  $ cd ${folderName}`);
    }
    console.log('  $ python -m venv .venv');
    console.log('  $ source .venv/bin/activate  # On Windows: .venv\\Scripts\\activate');
    console.log('  $ pip install -e ".[dev]"');
    console.log('  $ npm run dev\n');

    console.log('─'.repeat(70));
    console.log('Resources');
    console.log('─'.repeat(70));
    console.log('  Documentation: https://docs.agentmark.co');
    console.log('═'.repeat(70) + '\n');
  } catch (error) {
    console.error("Error creating Python app:", error);
    throw error;
  }
};
