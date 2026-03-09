import { expect, test, describe } from 'vitest';
import { bundle } from '../../bundler';
import { transform } from '../../index';
import { toMarkdown } from 'mdast-util-to-markdown';
import { mdxToMarkdown } from 'mdast-util-mdx';

const contentLoader = async () => '';

/**
 * Serialize an AST using the MDX-aware serializer (preserves JSX tags as-is).
 * The default `stringify` uses remark-stringify which may not preserve JSX elements.
 */
const toMdx = (tree: any): string =>
  toMarkdown(tree, { extensions: [mdxToMarkdown()] });

/** Recursively find a node in the AST matching a predicate. */
function findNode(node: any, predicate: (n: any) => boolean): any | undefined {
  if (predicate(node)) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

/** Recursively collect all nodes in the AST matching a predicate. */
function findAllNodes(node: any, predicate: (n: any) => boolean): any[] {
  const results: any[] = [];
  if (predicate(node)) results.push(node);
  if (node.children) {
    for (const child of node.children) {
      results.push(...findAllNodes(child, predicate));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Basic passthrough — validation passes (bundle level)
// ---------------------------------------------------------------------------
describe('Basic lowercase tag passthrough', () => {
  test('should not throw for simple lowercase tag', async () => {
    const input = `<examples>content</examples>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for self-closing lowercase tag', async () => {
    const input = `<example />`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for lowercase tag with string attribute', async () => {
    const input = `<context type="system">content</context>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for lowercase tag with expression attribute', async () => {
    const input = `<context type={"system"}>content</context>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for lowercase tag with boolean attribute', async () => {
    const input = `<rules strict>Follow these rules</rules>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. PascalCase still errors (regression)
// ---------------------------------------------------------------------------
describe('PascalCase tags still rejected', () => {
  test('should throw for PascalCase CustomTag', async () => {
    const input = `<CustomTag>content</CustomTag>`;
    await expect(bundle(input, __dirname, contentLoader)).rejects.toThrowError(
      /Unsupported tag '<CustomTag>'/,
    );
  });

  test('should throw for PascalCase MyExamples', async () => {
    const input = `<MyExamples>content</MyExamples>`;
    await expect(bundle(input, __dirname, contentLoader)).rejects.toThrowError(
      /Unsupported tag '<MyExamples>'/,
    );
  });

  test('should throw for single uppercase letter tag', async () => {
    const input = `<X>content</X>`;
    await expect(bundle(input, __dirname, contentLoader)).rejects.toThrowError(
      /Unsupported tag '<X>'/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Nested lowercase tags
// ---------------------------------------------------------------------------
describe('Nested lowercase tags', () => {
  test('should not throw for nested lowercase tags', async () => {
    const input = `<examples>
<example>one</example>
<example>two</example>
</examples>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for deeply nested lowercase tags', async () => {
    const input = `<instructions>
<context>
<rules>Be helpful</rules>
</context>
</instructions>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Mixed case scenarios — lowercase alongside registered PascalCase tags
// ---------------------------------------------------------------------------
describe('Mixed lowercase and registered tags', () => {
  test('should allow lowercase tags alongside If tag', async () => {
    const input = `<If condition={true}>Visible</If>
<examples>Example content</examples>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should allow lowercase tags inside Raw tag', async () => {
    const input = `<Raw>
<examples>These are raw examples</examples>
</Raw>`;
    // Raw skips child validation entirely, so this should work regardless
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should allow lowercase tags alongside HTML tags', async () => {
    const input = `<div>HTML content</div>
<examples>XML passthrough content</examples>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  test('should not throw for single character lowercase tag', async () => {
    const input = `<x>content</x>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for tag with numbers after first lowercase letter', async () => {
    const input = `<step1>First step</step1>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for tag with underscores', async () => {
    const input = `<my_tag>content</my_tag>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for empty lowercase tag', async () => {
    const input = `<examples></examples>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });

  test('should not throw for lowercase tag with multiline content', async () => {
    const input = `<examples>
Line one

Line two

Line three
</examples>`;
    await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Common prompt engineering XML tags
// ---------------------------------------------------------------------------
describe('Common prompt engineering XML tags', () => {
  // Note: <output>, <input>, <source> are in the HTML tag allowlist, so they pass
  // via isSupportedHTMLTag rather than the lowercase passthrough. We test them
  // anyway to ensure they work regardless of which path admits them.

  const commonTags = [
    'examples',
    'example',
    'context',
    'instructions',
    'rules',
    'thinking',
    'response',
    'scratchpad',
    'constraints',
    'persona',
    'format',
    'task',
    'goal',
  ];

  for (const tag of commonTags) {
    test(`should not throw for <${tag}> tag`, async () => {
      const input = `<${tag}>Content for ${tag}</${tag}>`;
      await expect(bundle(input, __dirname, contentLoader)).resolves.toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 7. End-to-end serialization: bundle -> transform -> toMarkdown
// ---------------------------------------------------------------------------
describe('End-to-end serialization pipeline', () => {
  test('should preserve simple lowercase tag through full pipeline', async () => {
    const input = `<examples>My examples</examples>`;
    const tree = await bundle(input, __dirname, contentLoader);
    const transformed = await transform(tree, {});
    const output = toMdx(transformed);

    expect(output).toContain('<examples>');
    expect(output).toContain('</examples>');
    expect(output).toContain('My examples');
  });

  test('should preserve nested lowercase tags through full pipeline', async () => {
    const input = `<examples>
<example>First</example>
<example>Second</example>
</examples>`;
    const tree = await bundle(input, __dirname, contentLoader);
    const transformed = await transform(tree, {});
    const output = toMdx(transformed);

    expect(output).toContain('<examples>');
    expect(output).toContain('</examples>');
    expect(output).toContain('<example>');
    expect(output).toContain('</example>');
    expect(output).toContain('First');
    expect(output).toContain('Second');
  });

  test('should preserve attributes on lowercase tags through full pipeline', async () => {
    const input = `<context type="system">System context</context>`;
    const tree = await bundle(input, __dirname, contentLoader);
    const transformed = await transform(tree, {});
    const output = toMdx(transformed);

    expect(output).toContain('<context');
    expect(output).toContain('type="system"');
    expect(output).toContain('System context');
    expect(output).toContain('</context>');
  });

  test('should preserve self-closing lowercase tag through full pipeline', async () => {
    const input = `<example />`;
    const tree = await bundle(input, __dirname, contentLoader);
    const transformed = await transform(tree, {});
    const output = toMdx(transformed);

    expect(output).toContain('<example');
    // Self-closing tags may serialize as <example /> or <example></example>
    expect(output).toMatch(/<example\s*\/?>|<example><\/example>/);
  });

  test('should evaluate expressions inside lowercase tags', async () => {
    const input = `<examples>{props.greeting} world</examples>`;
    const tree = await bundle(input, __dirname, contentLoader);
    const transformed = await transform(tree, { greeting: 'hello' });
    const output = toMdx(transformed);

    expect(output).toContain('<examples>');
    expect(output).toContain('hello');
    expect(output).toContain('world');
    expect(output).toContain('</examples>');
  });

  test('should handle lowercase tags with markdown content inside', async () => {
    const input = `<instructions>
Follow these **rules**:

1. Be helpful
2. Be concise
</instructions>`;
    const tree = await bundle(input, __dirname, contentLoader);
    const transformed = await transform(tree, {});
    const output = toMdx(transformed);

    expect(output).toContain('<instructions>');
    expect(output).toContain('</instructions>');
    expect(output).toContain('Be helpful');
    expect(output).toContain('Be concise');
  });

  test('should preserve multiple lowercase tags in sequence', async () => {
    const input = `<context>You are a helpful assistant</context>

<instructions>Answer clearly</instructions>

<examples>
<example>Q: Hello A: Hi!</example>
</examples>`;
    const tree = await bundle(input, __dirname, contentLoader);
    const transformed = await transform(tree, {});
    const output = toMdx(transformed);

    expect(output).toContain('<context>');
    expect(output).toContain('</context>');
    expect(output).toContain('<instructions>');
    expect(output).toContain('</instructions>');
    expect(output).toContain('<examples>');
    expect(output).toContain('</examples>');
  });
});

// ---------------------------------------------------------------------------
// 8. AST structure — verify the node type is correct for lowercase tags
// ---------------------------------------------------------------------------
describe('AST structure for lowercase tags', () => {
  test('should produce mdx jsx element node for lowercase tag', async () => {
    const input = `<examples>content</examples>`;
    const tree = await bundle(input, __dirname, contentLoader);

    // The node may be flow or text element depending on how MDX parses it
    const jsxNode = findNode(
      tree,
      (n: any) =>
        (n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') &&
        n.name === 'examples',
    );
    expect(jsxNode).toBeDefined();
    expect(jsxNode.name).toBe('examples');
  });

  test('should preserve attributes in AST for lowercase tag', async () => {
    const input = `<context type="system" priority={"high"}>content</context>`;
    const tree = await bundle(input, __dirname, contentLoader);

    const jsxNode = findNode(
      tree,
      (n: any) =>
        (n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') &&
        n.name === 'context',
    );
    expect(jsxNode).toBeDefined();

    const attrs = jsxNode.attributes;
    expect(attrs).toHaveLength(2);

    const typeAttr = attrs.find((a: any) => a.name === 'type');
    expect(typeAttr).toBeDefined();
    expect(typeAttr.value).toBe('system');
  });

  test('should preserve children in AST for nested lowercase tags', async () => {
    const input = `<examples>
<example>one</example>
<example>two</example>
</examples>`;
    const tree = await bundle(input, __dirname, contentLoader);

    const exampleNodes = findAllNodes(
      tree,
      (n: any) =>
        (n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') &&
        n.name === 'example',
    );
    expect(exampleNodes.length).toBe(2);
  });
});
