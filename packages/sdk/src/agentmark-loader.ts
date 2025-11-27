import { Loader, PromptKind, PromptShape } from "@agentmark/prompt-core";
import { FileLoader as SDKFileLoader } from "./file-loader";
import { FileLoader as StaticFileLoader } from "@agentmark/prompt-core";
import fs from "fs";
import path from "path";

export interface AgentMarkLoaderOptions {
  /**
   * AgentMark API key. If provided, uses CMS/cloud mode.
   * Can also be set via AGENTMARK_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * AgentMark App ID. Required for CMS/cloud mode.
   * Can also be set via AGENTMARK_APP_ID environment variable.
   */
  appId?: string;

  /**
   * Base URL for the AgentMark API or local dev server.
   * Can also be set via AGENTMARK_BASE_URL environment variable.
   * Defaults to https://api.agentmark.co in production,
   * or http://localhost:9418 for local development.
   */
  baseUrl?: string;

  /**
   * Path to the directory containing pre-built prompt files.
   * Used in static mode when no API key is provided.
   * Defaults to checking common locations: dist/agentmark, .agentmark/dist
   */
  staticPath?: string;
}

/**
 * Internal loader interface that doesn't require the generic type parameter.
 * Both SDKFileLoader and StaticFileLoader implement this shape.
 */
interface InternalLoader {
  load(path: string, promptType: PromptKind, options?: any): Promise<unknown>;
  loadDataset(
    datasetPath: string
  ): Promise<
    ReadableStream<{ input: Record<string, unknown>; expected_output?: string }>
  >;
}

/**
 * Finds the built prompts directory by checking common locations.
 */
function findBuiltPromptsDir(): string | null {
  const cwd = process.cwd();
  const commonPaths = [
    path.join(cwd, "dist", "agentmark"),
    path.join(cwd, ".agentmark", "dist"),
    path.join(cwd, "build", "agentmark"),
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, "manifest.json"))) {
      return p;
    }
  }

  return null;
}

/**
 * Checks if the URL points to a local development server.
 */
function isLocalDevServer(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

/**
 * AgentMarkLoader is a universal loader that automatically selects the appropriate
 * loading strategy based on the environment:
 *
 * - **Development Mode**: When `AGENTMARK_BASE_URL` points to localhost, connects to
 *   the local `agentmark dev` server for live prompt loading.
 *
 * - **Cloud Mode**: When `AGENTMARK_API_KEY` is set, prompts are fetched from
 *   the AgentMark CDN/API. This is ideal for production with CMS-managed prompts.
 *
 * - **Static Mode**: When no API key is present and no dev server, prompts are loaded
 *   from pre-built JSON files (output of `agentmark build`). This is for self-hosted deployments.
 *
 * @example
 * ```typescript
 * import { AgentMarkLoader } from "@agentmark/sdk";
 * import { createAgentMark } from "@agentmark/prompt-core";
 *
 * const loader = new AgentMarkLoader();
 * const client = createAgentMark({ loader, adapter });
 *
 * // Works in dev, cloud, and static modes without code changes
 * const prompt = await client.loadTextPrompt("my-prompt");
 * ```
 */
export class AgentMarkLoader<T extends PromptShape<T> = any>
  implements Loader<T>
{
  private loader: InternalLoader;
  private mode: "dev" | "cloud" | "static";

  constructor(options: AgentMarkLoaderOptions = {}) {
    const apiKey = options.apiKey || process.env.AGENTMARK_API_KEY;
    const appId = options.appId || process.env.AGENTMARK_APP_ID;
    const baseUrl =
      options.baseUrl ||
      process.env.AGENTMARK_BASE_URL ||
      (apiKey ? "https://api.agentmark.co" : "http://localhost:9418");

    // Check if we're pointing to a local dev server
    if (isLocalDevServer(baseUrl)) {
      // Development mode - connect to local agentmark dev server
      this.loader = new SDKFileLoader({
        apiKey: apiKey || "",
        appId: appId || "",
        baseUrl,
      });
      this.mode = "dev";
    } else if (apiKey && appId) {
      // Cloud mode - connect to AgentMark API
      this.loader = new SDKFileLoader({
        apiKey,
        appId,
        baseUrl,
      });
      this.mode = "cloud";
    } else {
      // Static mode - look for built files
      const staticPath = options.staticPath || findBuiltPromptsDir();

      if (!staticPath) {
        throw new Error(
          "AgentMark loader initialization failed.\n\n" +
            "Either:\n" +
            "  1. Run 'agentmark dev' for local development, or\n" +
            "  2. Set AGENTMARK_API_KEY and AGENTMARK_APP_ID for cloud mode, or\n" +
            "  3. Run 'agentmark build' to generate static prompt files\n\n" +
            "For more information, visit: https://docs.agentmark.co"
        );
      }

      this.loader = new StaticFileLoader(staticPath);
      this.mode = "static";
    }
  }

  /**
   * Returns the current mode: "dev", "cloud", or "static"
   */
  getMode(): "dev" | "cloud" | "static" {
    return this.mode;
  }

  async load(
    path: string,
    promptType: PromptKind,
    options?: any
  ): Promise<unknown> {
    return this.loader.load(path, promptType, options);
  }

  async loadDataset(
    datasetPath: string
  ): Promise<
    ReadableStream<{ input: Record<string, unknown>; expected_output?: string }>
  > {
    return this.loader.loadDataset(datasetPath);
  }
}
