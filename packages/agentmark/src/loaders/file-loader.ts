import path from "path";
import { load } from "@puzzlet/templatedx";
import { Loader } from "../types";

export class FileLoader<T = Record<string, { input: any; output: any }>> implements Loader {
  private basePath: string;

  constructor(
    private rootDir: string,
  ) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load<K extends keyof T & string>(
    templatePath: K
  ): Promise<any> {
    const fullPath = path.join(this.basePath, templatePath as string);
    const content = await load(fullPath);
    return content;
  }
}