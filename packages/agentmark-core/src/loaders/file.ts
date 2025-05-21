import path from "path";
import { load } from "@agentmark/templatedx";
import { Loader } from "../types";
import type { Ast } from "@agentmark/templatedx";
import { PromptShape } from "../types";
export class FileLoader<
  T extends PromptShape<T> = any
> implements Loader<T> {  private basePath: string;

  constructor(
    private rootDir: string,
  ) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load(
    templatePath: string
  ): Promise<Ast> {
    const fullPath = path.join(this.basePath, templatePath);
    const content = await load(fullPath);
    return content;
  }
}