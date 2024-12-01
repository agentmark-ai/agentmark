import { IModelPlugin } from "./model-plugin";

export class ModelPluginRegistry {
  public static plugins: Map<string, IModelPlugin> = new Map<
    string,
    IModelPlugin
  >();

  public static register(
    modelPlugin: IModelPlugin<any, any>,
    ids: string[]
  ) {
    for (const id of ids) {
      this.plugins.set(id, modelPlugin);
    }
  }

  public static registerAll(
    pluginEntries: { provider: IModelPlugin<any, any>; models: string[] }[]
  ) {
    for (const entry of pluginEntries) {
      this.register(entry.provider, entry.models);
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
