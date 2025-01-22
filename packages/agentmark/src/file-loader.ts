import path from 'path';
import { AgentMarkLoader, TypsafeTemplate, InferenceOptions } from './types';
import { getRawConfig as getRawConfigRuntime, runInference, deserialize as deserializeRuntime } from './runtime';
import { load } from '@puzzlet/templatedx';

export class FileLoader<T extends { [P in keyof T]: { input: any; output: any } }>
  implements AgentMarkLoader<T> {
  private basePath: string;

  constructor(private rootDir: string) {
    this.basePath = path.resolve(process.cwd(), rootDir);
  }

  async load<Path extends keyof T>(
    templatePath: Path
  ): Promise<TypsafeTemplate<T[Path]["input"], T[Path]["output"]>> {
    const fullPath = path.join(this.basePath, templatePath as string);
    const ast = await load(fullPath);

    return {
      content: ast,
      run: async (props: T[Path]["input"], options?: InferenceOptions): Promise<T[Path]["output"]> => {
        return runInference<T[Path]["input"], T[Path]["output"]>(ast, props, options);
      },
      deserialize: async (response: any): Promise<T[Path]["output"]> => {
        return deserializeRuntime(ast, response) as T[Path]["output"];
      },
      compile: async (props?: T[Path]["input"]) => getRawConfigRuntime(ast, props),
    };
  }
}