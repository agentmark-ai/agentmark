import cache from "./cache";

const AGENTMARK_TEMPLATE_ENDPOINT = `v1/templates`;

/**
 * Prompt kind types supported by the API loader.
 */
export type PromptKind = "object" | "text" | "image" | "speech";

/**
 * Options for cloud mode - requires authentication credentials.
 */
export interface CloudLoaderOptions {
  apiKey: string;
  appId: string;
  baseUrl?: string;
}

/**
 * Options for local development mode - just needs a base URL.
 */
export interface LocalLoaderOptions {
  baseUrl: string;
}

/**
 * @deprecated Use `ApiLoader.cloud()` or `ApiLoader.local()` factory methods instead.
 * Legacy options interface for backward compatibility.
 */
export interface ApiLoaderOptions {
  apiKey: string;
  baseUrl: string;
  appId: string;
}

type FetchTemplateOptions = {
  cache:
    | {
        ttl?: number;
      }
    | false;
};

/**
 * ApiLoader fetches prompts from the AgentMark API or local dev server.
 *
 * @example Cloud mode (production)
 * ```ts
 * const loader = ApiLoader.cloud({
 *   apiKey: process.env.AGENTMARK_API_KEY!,
 *   appId: process.env.AGENTMARK_APP_ID!,
 * });
 * ```
 *
 * @example Local mode (development)
 * ```ts
 * const loader = ApiLoader.local({
 *   baseUrl: 'http://localhost:9418',
 * });
 * ```
 */
export class ApiLoader {
  private apiKey: string | undefined;
  private appId: string | undefined;
  private baseUrl: string;

  /**
   * @deprecated Use `ApiLoader.cloud()` or `ApiLoader.local()` factory methods instead.
   */
  constructor(options: ApiLoaderOptions) {
    this.apiKey = options.apiKey || undefined;
    this.appId = options.appId || undefined;
    this.baseUrl = options.baseUrl;
  }

  /**
   * Create a loader for cloud/production use with AgentMark API.
   * Requires API credentials.
   */
  static cloud(options: CloudLoaderOptions): ApiLoader {
    const instance = Object.create(ApiLoader.prototype);
    instance.apiKey = options.apiKey;
    instance.appId = options.appId;
    instance.baseUrl = options.baseUrl || 'https://api.agentmark.co';
    return instance;
  }

  /**
   * Create a loader for local development with the AgentMark dev server.
   * No credentials required - just point to your local server.
   */
  static local(options: LocalLoaderOptions): ApiLoader {
    const instance = Object.create(ApiLoader.prototype);
    instance.apiKey = undefined;
    instance.appId = undefined;
    instance.baseUrl = options.baseUrl;
    return instance;
  }

  async load(
    path: string,
    promptKind: PromptKind,
    options: FetchTemplateOptions = { cache: { ttl: 1000 * 60 } }
  ): Promise<unknown> {
    const ast =
      options.cache && cache.has(path as string)
        ? cache.get<any>(path as string)!
        : await this.fetchRequest({ path, promptKind });

    if (options.cache) {
      cache.set(path as string, ast, {
        ttl: options.cache.ttl,
      });
    }

    return ast;
  }

  async loadDataset(
    datasetPath: string
  ): Promise<
    ReadableStream<{ input: Record<string, unknown>; expected_output?: string }>
  > {
    const response = await this.fetchRequest(
      { path: datasetPath },
      { stream: true }
    );

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let rowCount = 0;

    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer);
              // Handle case where server returns JSON array instead of NDJSON
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const item of items) {
                // Validate that the row has an input field
                if (!item.input || typeof item.input !== 'object') {
                  throw new Error(`Invalid dataset row: missing or invalid 'input' field. Each row must have an 'input' object.`);
                }
                controller.enqueue(item);
                rowCount++;
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                throw new Error(`Failed to parse JSON in dataset ${datasetPath}: ${e.message}`);
              }
              throw e;
            }
          }
          if (rowCount === 0) {
            throw new Error(`Dataset ${datasetPath} is empty or contains no valid rows`);
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              // Handle case where server returns JSON array instead of NDJSON
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const item of items) {
                // Validate that the row has an input field
                if (!item.input || typeof item.input !== 'object') {
                  throw new Error(`Invalid dataset row: missing or invalid 'input' field. Each row must have an 'input' object.`);
                }
                controller.enqueue(item);
                rowCount++;
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                throw new Error(`Failed to parse JSON in dataset ${datasetPath}: ${e.message}`);
              }
              throw e;
            }
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    });
  }

  private async fetchRequest(
    queryParams: Record<string, string>,
    options: { stream?: boolean } = {}
  ) {
    const headers = new Headers({
      "Content-Type": "application/json",
    });

    // Only add auth headers in cloud mode (when credentials are present)
    if (this.apiKey && this.appId) {
      headers.set("X-Agentmark-App-Id", this.appId);
      headers.set("Authorization", this.apiKey);
    }

    // Request NDJSON format for streaming datasets
    if (options.stream) {
      headers.set("Accept", "application/x-ndjson");
    }

    const response = await fetch(
      `${this.baseUrl}/${AGENTMARK_TEMPLATE_ENDPOINT}?${new URLSearchParams(queryParams).toString()}`,
      {
        headers,
      }
    );

    if (response.ok) {
      if (options.stream) {
        return response;
      }

      return (await response.json()).data;
    }
    const errorResponse = await response.json();
    throw errorResponse.error;
  }
}
