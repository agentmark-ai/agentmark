import path from "path";
import { languageTemplateDX, determinePromptType, getTemplateDXInstance } from "../template_engines/templatedx-instances";
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
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Create a contentLoader function for reading additional files
    const contentLoader = async (filePath: string) => {
      return fs.readFileSync(filePath, 'utf-8');
    };
    
    // Use a TemplateDX instance to parse the content instead of static load function
    // First parse with language instance to get frontmatter and determine type
    const initialAst = await languageTemplateDX.parse(content, this.basePath, contentLoader);
    const frontMatter = languageTemplateDX.getFrontMatter(initialAst);
    const promptType = determinePromptType(frontMatter);
    
    // Get the appropriate instance and re-parse if needed
    const templateDXInstance = getTemplateDXInstance(promptType);
    
    // If it's already the language instance, use the existing AST
    if (promptType === 'language') {
      return initialAst;
    }
    
    // Otherwise, parse with the appropriate instance
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
