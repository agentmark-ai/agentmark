import { Loader, PromptKind, PromptShape } from "@agentmark/prompt-core";
import { AGENTMARK_TEMPLATE_ENDPOINT } from "./config";
import cache from "./cache";

interface FileLoaderOptions {
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

export class FileLoader<T extends PromptShape<T>> implements Loader<T> {
  private apiKey: string;
  private appId: string;
  private baseUrl: string;

  constructor(options: FileLoaderOptions) {
    this.apiKey = options.apiKey;
    this.appId = options.appId;
    this.baseUrl = options.baseUrl;
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
      "X-Agentmark-App-Id": this.appId,
      Authorization: `${this.apiKey}`,
    });

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
