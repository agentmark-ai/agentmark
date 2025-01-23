import path from "path";
import { Ast, load } from "@puzzlet/templatedx";
import { AgentMarkLoader, TypsafeTemplate } from './types';
import type { Template } from './runtime';

type TemplateRunner = <Input extends Record<string, any>, Output>(ast: Ast) => Omit<Template<Input, Output>, 'content'>;

export class FileLoader<T extends { [P in keyof T]: { input: Record<string, any>; output: any } }> implements AgentMarkLoader<T> {
  private basePath: string;

  constructor(
    private rootDir: string,
    private createRunner: TemplateRunner
  ) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load<Path extends keyof T>(
    templatePath: Path
  ): Promise<TypsafeTemplate<T[Path]["input"], T[Path]["output"]>> {
    const fullPath = path.join(this.basePath, templatePath as string);
    const ast = await load(fullPath);

    const runner = this.createRunner<T[Path]["input"], T[Path]["output"]>(ast);

    return {
      content: ast,
      run: runner.run,
      deserialize: runner.deserialize,
      compile: runner.compile,
    };
  }
}