import { PromptDXModelPlugin } from "./PromptDXModelPlugin";

export class PromptDXModelPluginRegistry {
  public static plugins: Map<string, PromptDXModelPlugin> = new Map<
    string,
    PromptDXModelPlugin
  >();

  public static register(
    modelPlugin: PromptDXModelPlugin<any, any>,
    ids: string[]
  ) {
    for (const id of ids) {
      this.plugins.set(id, modelPlugin);
    }
  }

  public static getPlugin(id: string) {
    return this.plugins.get(id);
  }

  public static removePlugin(id: string) {
    this.plugins.delete(id);
  }

  public static clearRegistry() {
    this.plugins.clear();
  }
}
