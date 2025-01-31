import path from "path";
import { Ast, load } from "@puzzlet/templatedx";
import { AgentMarkLoader, TypsafeTemplate } from './types';
import type { Template } from './runtime';

type TemplateRunner = <Input extends Record<string, any>, Output>(ast: Ast) => Omit<Template<Input, Output>, 'content'>;

type DefaultIO = {
  input: Record<string, any>;
  output: any;
}

export class FileLoader<T extends { [P in keyof T]: { input: any; output: any } } = { [key: string]: DefaultIO }> implements AgentMarkLoader<T> {
  private basePath: string;

  constructor(
    private rootDir: string,
    private createRunner: TemplateRunner
  ) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load<Path extends keyof T | (T extends { [key: string]: DefaultIO } ? string : never)>(
    templatePath: Path
  ): Promise<Path extends keyof T 
    ? TypsafeTemplate<T[Path]["input"], T[Path]["output"]>
    : TypsafeTemplate<any, any>> {
    const fullPath = path.join(this.basePath, templatePath as string);
    const ast = await load(fullPath);
    const runner = this.createRunner(ast);

    return {
      content: ast,
      ...runner
    } as any;
  }
}