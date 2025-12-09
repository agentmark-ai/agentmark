import { TagPluginRegistry } from './tag-plugin-registry';
import { FilterRegistry } from './filter-registry';
import { TagPlugin } from './tag-plugin';
import type { FilterFunction } from './filter-registry';
import { transformTree } from './transformer';
import { bundle } from './bundler';
import { parse, stringify, getFrontMatter, compressAst } from './ast-utils';
import type { Root } from 'mdast';
import type { ContentLoader } from './types';

export class TemplateDX {
  private tagRegistry: TagPluginRegistry;
  private filterRegistry: FilterRegistry;

  constructor(options: { 
    includeBuiltins?: boolean;
    tagRegistry?: TagPluginRegistry;
    filterRegistry?: FilterRegistry;
  } = {}) {
    const { includeBuiltins = true, tagRegistry, filterRegistry } = options;
    
    this.tagRegistry = tagRegistry || new TagPluginRegistry();
    this.filterRegistry = filterRegistry || new FilterRegistry();
    
    // Copy built-in plugins and filters if requested
    if (includeBuiltins) {
      this.tagRegistry.copyFromStatic();
      this.filterRegistry.copyFromStatic();
    }
  }

  // Tag plugin management
  registerTagPlugin(plugin: TagPlugin, names: string[]): void {
    this.tagRegistry.register(plugin, names);
  }

  removeTagPlugin(name: string): void {
    this.tagRegistry.remove(name);
  }

  getTagPlugin(name: string): TagPlugin | undefined {
    return this.tagRegistry.get(name);
  }

  getAllTagPlugins(): Map<string, TagPlugin> {
    return this.tagRegistry.getAll();
  }

  // Filter management
  registerFilter(name: string, filterFunction: FilterFunction): void {
    this.filterRegistry.register(name, filterFunction);
  }

  removeFilter(name: string): void {
    this.filterRegistry.remove(name);
  }

  getFilter(name: string): FilterFunction | undefined {
    return this.filterRegistry.get(name);
  }

  getAllFilters(): Map<string, FilterFunction> {
    return this.filterRegistry.getAll();
  }

  // Transform operations using this instance's registries
  async transform(tree: Root, props: Record<string, any> = {}, shared: Record<string, any> = {}): Promise<Root> {
    return transformTree(tree, props, shared, this);
  }

  async parse(mdxContent: string, baseDir: string, contentLoader: ContentLoader): Promise<Root> {
    return bundle(mdxContent, baseDir, contentLoader, this);
  }

  // Static utilities (these don't depend on registries)
  stringify = stringify;
  getFrontMatter = getFrontMatter;
  compressAst = compressAst;
  parseAst = parse;

  // Internal access to registries for use by transformer/bundler
  getTagRegistry(): TagPluginRegistry {
    return this.tagRegistry;
  }

  getFilterRegistry(): FilterRegistry {
    return this.filterRegistry;
  }
}