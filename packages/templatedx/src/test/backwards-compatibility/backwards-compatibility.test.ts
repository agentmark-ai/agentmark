import { expect, test, describe } from 'vitest';
import { 
  stringify, 
  transform, 
  TagPluginRegistry, 
  TagPlugin, 
  FilterRegistry 
} from '../../index';
import { parse } from '../../ast-utils';
import type { Node } from 'mdast';
import type { PluginContext } from '../../tag-plugin';

// Custom test plugin for backwards compatibility testing
class LegacyTestPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    _children: Node[],
    _context: PluginContext
  ): Promise<Node[] | Node> {
    return {
      type: 'text',
      value: 'Legacy plugin works!',
    } as Node;
  }
}

describe('Backwards Compatibility', () => {
  test('should still work with static TagPluginRegistry', async () => {
    // Register plugin using the old static API
    const legacyPlugin = new LegacyTestPlugin();
    TagPluginRegistry.register(legacyPlugin, ['LegacyTest']);
    
    const input = '<LegacyTest></LegacyTest>';
    const tree = parse(input);
    const result = await transform(tree);
    const output = stringify(result);
    
    expect(output.trim()).toBe('Legacy plugin works!');
    
    // Clean up
    TagPluginRegistry.remove('LegacyTest');
  });

  test('should still work with static FilterRegistry', async () => {
    // Register filter using the old static API
    const legacyFilter = (input: string) => `LEGACY: ${input}`;
    FilterRegistry.register('legacy', legacyFilter);
    
    const input = '{legacy("test")}';
    const tree = parse(input);
    const result = await transform(tree);
    const output = stringify(result);
    
    expect(output.trim()).toBe('LEGACY: test');
    
    // Clean up
    FilterRegistry.remove('legacy');
  });

  test('should work with built-in conditional tags via static API', async () => {
    const input = `<If condition={props.show}>Static API works!</If>`;
    const tree = parse(input);
    const result = await transform(tree, { show: true });
    const output = stringify(result);
    
    expect(output.trim()).toBe('Static API works!');
  });

  test('should work with built-in filters via static API', async () => {
    const input = '{upper(props.text)}';
    const tree = parse(input);
    const result = await transform(tree, { text: 'hello world' });
    const output = stringify(result);
    
    expect(output.trim()).toBe('HELLO WORLD');
  });

  test('should work with ForEach tag via static API', async () => {
    const input = `<ForEach arr={props.items}>
  {(item) => (
    <>
      {item}
    </>
  )}
</ForEach>`;
    const tree = parse(input);
    const result = await transform(tree, { items: ['a', 'b', 'c'] });
    const output = stringify(result);
    
    expect(output.trim()).toBe('abc');
  });

  test('static registries should have all built-in plugins', () => {
    // Verify built-in plugins are registered statically
    expect(TagPluginRegistry.get('If')).toBeDefined();
    expect(TagPluginRegistry.get('ElseIf')).toBeDefined();
    expect(TagPluginRegistry.get('Else')).toBeDefined();
    expect(TagPluginRegistry.get('ForEach')).toBeDefined();
    expect(TagPluginRegistry.get('Raw')).toBeDefined();
  });

  test('static registries should have all built-in filters', () => {
    // Verify built-in filters are registered statically
    expect(FilterRegistry.get('upper')).toBeDefined();
    expect(FilterRegistry.get('lower')).toBeDefined();
    expect(FilterRegistry.get('capitalize')).toBeDefined();
    expect(FilterRegistry.get('truncate')).toBeDefined();
    expect(FilterRegistry.get('abs')).toBeDefined();
    expect(FilterRegistry.get('join')).toBeDefined();
    expect(FilterRegistry.get('round')).toBeDefined();
    expect(FilterRegistry.get('replace')).toBeDefined();
    expect(FilterRegistry.get('urlencode')).toBeDefined();
    expect(FilterRegistry.get('dump')).toBeDefined();
  });
});