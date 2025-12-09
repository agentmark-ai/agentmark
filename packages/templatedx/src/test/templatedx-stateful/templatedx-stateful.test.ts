import { expect, test, describe } from 'vitest';
import { TemplateDX, TagPlugin, stringify, TagPluginRegistry } from '../../index';
import { parse } from '../../ast-utils';
import type { Node } from 'mdast';
import type { PluginContext } from '../../tag-plugin';

// Custom test plugin for testing stateful functionality
class TestPlugin extends TagPlugin {
  private message: string;
  
  constructor(message: string) {
    super();
    this.message = message;
  }

  async transform(
    _props: Record<string, any>,
    _children: Node[],
    _context: PluginContext
  ): Promise<Node[] | Node> {
    return {
      type: 'text',
      value: this.message,
    } as Node;
  }
}

class CounterPlugin extends TagPlugin {
  private count = 0;

  async transform(
    _props: Record<string, any>,
    _children: Node[],
    _context: PluginContext
  ): Promise<Node[] | Node> {
    this.count++;
    return {
      type: 'text',
      value: `Count: ${this.count}`,
    } as Node;
  }
}

describe('TemplateDX Stateful Engine', () => {
  test('should create instance with built-in plugins by default', () => {
    const engine = new TemplateDX();
    
    // Check that built-in plugins are available
    expect(engine.getTagPlugin('If')).toBeDefined();
    expect(engine.getTagPlugin('ForEach')).toBeDefined();
    expect(engine.getTagPlugin('Raw')).toBeDefined();
    
    // Check that built-in filters are available
    expect(engine.getFilter('upper')).toBeDefined();
    expect(engine.getFilter('lower')).toBeDefined();
    expect(engine.getFilter('capitalize')).toBeDefined();
  });

  test('should create instance without built-in plugins when requested', () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    
    // Check that built-in plugins are NOT available
    expect(engine.getTagPlugin('If')).toBeUndefined();
    expect(engine.getTagPlugin('ForEach')).toBeUndefined();
    expect(engine.getTagPlugin('Raw')).toBeUndefined();
    
    // Check that built-in filters are NOT available
    expect(engine.getFilter('upper')).toBeUndefined();
    expect(engine.getFilter('lower')).toBeUndefined();
    expect(engine.getFilter('capitalize')).toBeUndefined();
  });

  test('should allow registering custom tag plugins', () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const testPlugin = new TestPlugin('Hello from custom plugin!');
    
    engine.registerTagPlugin(testPlugin, ['CustomTest']);
    
    expect(engine.getTagPlugin('CustomTest')).toBe(testPlugin);
  });

  test('should allow registering custom filters', () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const customFilter = (input: string) => `[${input}]`;
    
    engine.registerFilter('bracket', customFilter);
    
    expect(engine.getFilter('bracket')).toBe(customFilter);
  });

  test('should maintain separate state between instances', () => {
    const engine1 = new TemplateDX({ includeBuiltins: false });
    const engine2 = new TemplateDX({ includeBuiltins: false });
    
    const plugin1 = new TestPlugin('Engine 1');
    const plugin2 = new TestPlugin('Engine 2');
    
    engine1.registerTagPlugin(plugin1, ['Test']);
    engine2.registerTagPlugin(plugin2, ['Test']);
    
    expect(engine1.getTagPlugin('Test')).toBe(plugin1);
    expect(engine2.getTagPlugin('Test')).toBe(plugin2);
    expect(engine1.getTagPlugin('Test')).not.toBe(engine2.getTagPlugin('Test'));
  });

  test('should transform using custom plugins', async () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const testPlugin = new TestPlugin('Custom plugin worked!');
    
    engine.registerTagPlugin(testPlugin, ['CustomTest']);
    
    const input = '<CustomTest></CustomTest>';
    const tree = parse(input);
    const result = await engine.transform(tree);
    const output = stringify(result);
    
    expect(output.trim()).toBe('Custom plugin worked!');
  });

  test('should use custom filters in expressions', async () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const bracketFilter = (input: string) => `[${input}]`;
    
    engine.registerFilter('bracket', bracketFilter);
    
    const input = '{bracket("test")}';
    const tree = parse(input);
    const result = await engine.transform(tree, { test: 'hello' });
    const output = stringify(result);
    
    // Remark escapes markdown characters, so we expect escaped output
    expect(output.trim()).toBe('\\[test]');
  });

  test('should maintain plugin state between calls', async () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const counterPlugin = new CounterPlugin();
    
    engine.registerTagPlugin(counterPlugin, ['Counter']);
    
    const input = '<Counter></Counter>\n\n<Counter></Counter>';
    const tree = parse(input);
    const result = await engine.transform(tree);
    const output = stringify(result);
    
    expect(output.trim()).toBe('Count: 1Count: 2');
  });

  test('should not affect global registries', () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const testPlugin = new TestPlugin('Instance plugin');
    
    engine.registerTagPlugin(testPlugin, ['InstanceOnly']);
    
    // Static registry should not have the instance plugin
    expect(TagPluginRegistry.get('InstanceOnly')).toBeUndefined();
  });

  test('should work with built-in conditional tags', async () => {
    const engine = new TemplateDX();
    
    const input = `<If condition={props.show}>Visible</If>`;
    const tree = parse(input);
    const result = await engine.transform(tree, { show: true });
    const output = stringify(result);
    
    expect(output.trim()).toBe('Visible');
  });

  test('should work with built-in ForEach tag', async () => {
    const engine = new TemplateDX();
    
    const input = `<ForEach arr={props.items}>
  {(item) => (
    <>
      {item}
    </>
  )}
</ForEach>`;
    const tree = parse(input);
    const result = await engine.transform(tree, { items: ['a', 'b', 'c'] });
    const output = stringify(result);
    
    expect(output.trim()).toBe('abc');
  });

  test('should allow removing plugins', () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const testPlugin = new TestPlugin('Test');
    
    engine.registerTagPlugin(testPlugin, ['Test']);
    expect(engine.getTagPlugin('Test')).toBe(testPlugin);
    
    engine.removeTagPlugin('Test');
    expect(engine.getTagPlugin('Test')).toBeUndefined();
  });

  test('should allow removing filters', () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const testFilter = (input: string) => input;
    
    engine.registerFilter('test', testFilter);
    expect(engine.getFilter('test')).toBe(testFilter);
    
    engine.removeFilter('test');
    expect(engine.getFilter('test')).toBeUndefined();
  });

  test('should get all plugins and filters', () => {
    const engine = new TemplateDX({ includeBuiltins: false });
    const testPlugin = new TestPlugin('Test');
    const testFilter = (input: string) => input;
    
    engine.registerTagPlugin(testPlugin, ['Test1', 'Test2']);
    engine.registerFilter('filter1', testFilter);
    engine.registerFilter('filter2', testFilter);
    
    const allPlugins = engine.getAllTagPlugins();
    const allFilters = engine.getAllFilters();
    
    expect(allPlugins.size).toBe(2);
    expect(allPlugins.get('Test1')).toBe(testPlugin);
    expect(allPlugins.get('Test2')).toBe(testPlugin);
    
    expect(allFilters.size).toBe(2);
    expect(allFilters.get('filter1')).toBe(testFilter);
    expect(allFilters.get('filter2')).toBe(testFilter);
  });
});