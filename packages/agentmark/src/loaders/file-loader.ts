import path from "path";
import { load } from "@puzzlet/templatedx";
import { Loader } from "../types";
import type { Ast } from "@puzzlet/templatedx";

export class FileLoader<T = Record<string, { input: any; output: any }>> implements Loader<Ast> {
  private basePath: string;

  constructor(
    private rootDir: string,
  ) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load<K extends keyof T & string>(
    templatePath: K
  ): Promise<Ast> {
    const fullPath = path.join(this.basePath, templatePath as string);
    const content = await load(fullPath);
    return content;
  }
}