import path from "path";
import { getTemplateDXInstance } from "../template_engines/templatedx-instances";
import { Loader, PromptKind } from "../types";
import type { Ast } from "@agentmark/templatedx";
import { PromptShape } from "../types";
import fs from "fs";
import readline from "readline";

type TemplatedXInstanceType = 'image' | 'speech' | 'language';

function mapPromptKindToInstanceType(promptKind: PromptKind): TemplatedXInstanceType {
  switch (promptKind) {
    case 'image':
      return 'image';
    case 'speech':
      return 'speech';
    case 'text':
    case 'object':
      return 'language';
    default:
      throw new Error(`Invalid prompt kind: ${promptKind}. Must be one of: image, speech, text, object.`);
  }
}

export class FileLoader<T extends PromptShape<T> = any> implements Loader<T> {
  private basePath: string;

  constructor(rootDir: string) {
    const cwd = (() => { try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; } })();
    this.basePath = path.resolve(cwd, rootDir);
  }

  /**
   * Validates a user-provided path and returns a safe absolute path within the base directory.
   * Throws an error if the path attempts to escape the base directory.
   * @param userPath - The user-provided path to validate
   * @returns A validated absolute path within the base directory
   */
  private validateAndResolvePath(userPath: string): string {
    // Reject absolute paths
    if (path.isAbsolute(userPath)) {
      throw new Error('Absolute paths are not allowed');
    }

    // Normalize the path to resolve . and .. sequences
    const normalizedPath = path.normalize(userPath);

    // Check if normalized path tries to escape by starting with /
    if (normalizedPath.startsWith('/')) {
      throw new Error('Invalid path: path traversal detected');
    }

    // Join with base path to create full path
    const fullPath = path.join(this.basePath, normalizedPath);

    // Verify the resolved path is still within the base directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(this.basePath);
    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
      throw new Error('Access denied: path outside allowed directory');
    }

    // Return the validated path
    return resolvedPath;
  }

  async load(templatePath: string, promptType: PromptKind, _options?: any): Promise<Ast> {
    // Validate the path and get a safe absolute path
    const safePath = this.validateAndResolvePath(templatePath);

    const content = fs.readFileSync(safePath, 'utf-8');

    // Create a contentLoader function for reading additional files
    const contentLoader = async (filePath: string) => {
      return fs.readFileSync(filePath, 'utf-8');
    };

    const instanceType = mapPromptKindToInstanceType(promptType);
    const templateDXInstance = getTemplateDXInstance(instanceType);
    return await templateDXInstance.parse(content, this.basePath, contentLoader);
  }

  async loadDataset(datasetPath: string): Promise<
    ReadableStream<{
      input: Record<string, unknown>;
      expected_output?: string;
    }>
  > {
    if (!datasetPath.endsWith(".jsonl"))
      throw new Error("Dataset must be a JSON Lines file (.jsonl)");

    // Validate the path and get a safe absolute path
    const safePath = this.validateAndResolvePath(datasetPath);

    const fileStream = fs.createReadStream(safePath, { encoding: "utf8" });
    const lines = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let rowCount = 0;
    return new ReadableStream({
      async start(controller) {
        for await (const line of lines) {
          if (!line.trim()) continue; // Skip empty lines
          try {
            const jsonData = JSON.parse(line);
            // Validate that the row has an input field
            if (!jsonData.input || typeof jsonData.input !== 'object') {
              throw new Error(`Invalid dataset row at line ${rowCount + 1}: missing or invalid 'input' field. Each row must have an 'input' object.`);
            }
            controller.enqueue(jsonData);
            rowCount++;
          } catch (error) {
            if (error instanceof SyntaxError) {
              throw new Error(`Failed to parse JSON at line ${rowCount + 1} in dataset ${datasetPath}: ${error.message}`);
            }
            throw error;
          }
        }
        if (rowCount === 0) {
          throw new Error(`Dataset ${datasetPath} is empty or contains no valid rows`);
        }
        controller.close();
      },
    });
  }
}
