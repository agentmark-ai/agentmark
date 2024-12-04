export type Tool = (...args: any[]) => Promise<any>;

export class ToolPluginRegistry {
  public static tools: Map<string, Tool> = new Map<string, Tool>();

  public static register(toolFunction: Tool, name: string) {
    if (this.tools.has(name)) {
      throw new Error(`Tool with the name "${name}" is already registered.`);
    }
    this.tools.set(name, toolFunction);
  }

  public static registerAll(toolEntries: { toolFunction: Tool; name: string }[]) {
    for (const entry of toolEntries) {
      this.register(entry.toolFunction, entry.name);
    }
  }

  public static getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  public static removeTool(name: string) {
    if (!this.tools.delete(name)) {
      throw new Error(`Tool with the name "${name}" does not exist.`);
    }
  }

  public static clearRegistry() {
    this.tools.clear();
  }
}