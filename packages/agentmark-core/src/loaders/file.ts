import path from "path";
import { load } from "@agentmark/templatedx";
import { Loader } from "../types";
import type { Ast } from "@agentmark/templatedx";
import { PromptShape } from "../types";
import fs from "fs";
import readline from "readline";

export class FileLoader<T extends PromptShape<T> = any> implements Loader<T> {
  private basePath: string;

  constructor(private rootDir: string) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load(templatePath: string): Promise<Ast> {
    const fullPath = path.join(this.basePath, templatePath);
    const content = await load(fullPath);
    return content;
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
