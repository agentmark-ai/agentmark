export type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
    ? A[K]
    : never;
};

export type ToolMetadata<
  Parameters extends Record<string, unknown> = Record<string, unknown>
> = {
  name: string;
  description: string;
  parameters?: Parameters;
};

export class LlamaIndexToolRegistry<
  TD extends Record<string, { args: any }> = Record<string, { args: any }>,
  RM extends Partial<Record<keyof TD, any>> = {}
> {
  private map: Map<
    string,
    (args: any, toolContext?: Record<string, any>) => any
  > = new Map();

  register<K extends string, R>(
    name: K,
    fn: (args: any, toolContext?: Record<string, any>) => R | Promise<R>
  ): LlamaIndexToolRegistry<
    TD & { [P in K]: { args: any } },
    Merge<RM, { [P in K]: R }>
  > {
    this.map.set(name, fn);
    return this as any;
  }

  get(name: string) {
    return this.map.get(name);
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  getRegisteredTools(): Array<{
    name: string;
    implementation: (args: any, toolContext?: Record<string, any>) => any;
  }> {
    const tools: Array<{
      name: string;
      implementation: (args: any, toolContext?: Record<string, any>) => any;
    }> = [];

    for (const [name, impl] of this.map.entries()) {
      tools.push({
        name,
        implementation: impl,
      });
    }

    return tools;
  }

  getToolNames(): string[] {
    return Array.from(this.map.keys());
  }
}
