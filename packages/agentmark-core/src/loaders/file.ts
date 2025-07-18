import path from "path";
import { getTemplateDXInstance } from "../template_engines/templatedx-instances";
import { Loader, PromptKind } from "../types";
import type { Ast } from "@agentmark/templatedx";
import { PromptShape } from "../types";
import fs from "fs";
import readline from "readline";

type TemplatedXInstanceType = "image" | "speech" | "language";

function mapPromptKindToInstanceType(
  promptKind: PromptKind
): TemplatedXInstanceType {
  switch (promptKind) {
    case "image":
      return "image";
    case "speech":
      return "speech";
    case "text":
    case "object":
      return "language";
    default:
      throw new Error(
        `Invalid prompt kind: ${promptKind}. Must be one of: image, speech, text, object.`
      );
  }
}

export class FileLoader<T extends PromptShape<T> = any, Context = never>
  implements Loader<T, Context>
{
  private basePath: string;

  constructor(private rootDir: string) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load(
    templatePath: string,
    promptType: PromptKind,
    options?: any
  ): Promise<{
    prompt: unknown;
    context: Context;
  }> {
    const fullPath = path.join(this.basePath, templatePath);
    const content = fs.readFileSync(fullPath, "utf-8");

    // Create a contentLoader function for reading additional files
    const contentLoader = async (filePath: string) => {
      return fs.readFileSync(filePath, "utf-8");
    };

    const instanceType = mapPromptKindToInstanceType(promptType);
    const templateDXInstance = getTemplateDXInstance(instanceType);
    const prompt = await templateDXInstance.parse(
      content,
      this.basePath,
      contentLoader
    );

    return {
      prompt,
      context: undefined as Context,
    };
  }

  async loadDataset(datasetPath: string): Promise<
    ReadableStream<{
      input: Record<string, unknown>;
      expected_output?: string;
    }>
  > {
    if (!datasetPath.endsWith(".jsonl"))
      throw new Error("Dataset must be a JSON Lines file (.jsonl)");

    const fullPath = path.join(this.basePath, datasetPath);
    const fileStream = fs.createReadStream(fullPath, { encoding: "utf8" });
    const lines = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    return new ReadableStream({
      async start(controller) {
        for await (const line of lines) {
          try {
            const jsonData = JSON.parse(line);
            controller.enqueue(jsonData);
          } catch (error) {
            console.error("Error parsing JSON line:", error);
          }
        }
        controller.close();
      },
    });
  }
}
