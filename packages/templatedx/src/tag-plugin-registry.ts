import { TagPlugin } from './tag-plugin';

export class TagPluginRegistry {
  private static plugins: Map<string, TagPlugin> = new Map();
  private plugins: Map<string, TagPlugin> = new Map();

  // Static methods for backwards compatibility
  static register(plugin: TagPlugin, names: string[]): void {
    names.forEach((name) => {
      this.plugins.set(name, plugin);
    });
  }

  static get(name: string): TagPlugin | undefined {
    return this.plugins.get(name);
  }

  static getAll(): Map<string, TagPlugin> {
    return new Map(this.plugins);
  }

  static remove(name: string): void {
    this.plugins.delete(name);
  }

  static removeAll(): void {
    this.plugins.clear();
  }

  // Instance methods for stateful usage
  register(plugin: TagPlugin, names: string[]): void {
    names.forEach((name) => {
      this.plugins.set(name, plugin);
    });
  }

  get(name: string): TagPlugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): Map<string, TagPlugin> {
    return new Map(this.plugins);
  }

  remove(name: string): void {
    this.plugins.delete(name);
  }

  removeAll(): void {
    this.plugins.clear();
  }

  // Copy static plugins to instance (useful for inheriting built-ins)
  copyFromStatic(): void {
    TagPluginRegistry.plugins.forEach((plugin, name) => {
      this.plugins.set(name, plugin);
    });
  }
}