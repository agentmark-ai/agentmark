import { expect, test } from 'vitest'
import { bundle } from "../../bundler";
import { transform, stringify } from "../../index";
import { getInput, getOutput } from "../helpers";

const contentLoader = async (path: string) => {
  if (path.includes('test-component.mdx')) {
    return `# {props.title}

{props.children}`;
  }
  return '';
};

test('should allow all supported tags without errors', async () => {
  const input = getInput(__dirname);
  const expectedOutput = getOutput(__dirname);
  
  // Should not throw any errors
  const tree = await bundle(input, __dirname, contentLoader);
  const processedTree = await transform(tree, {});
  const result = stringify(processedTree);
  
  expect(result).toBe(expectedOutput);
});

test('should allow native HTML elements', async () => {
  const input = `<div>Content</div><span>Inline</span><p>Paragraph</p>`;
  
  // Should not throw any errors
  const tree = await bundle(input, __dirname, contentLoader);
  const result = stringify(tree);
  
  expect(result).toContain('<div>Content</div>');
  expect(result).toContain('<span>Inline</span>');
  expect(result).toContain('Paragraph'); // p tag gets converted to paragraph
});

test('should allow built-in TemplateDX tags', async () => {
  const input = `<If condition={true}>Visible</If><Raw>Raw content</Raw>`;
  
  // Should not throw any errors
  const tree = await bundle(input, __dirname, contentLoader);
  const processedTree = await transform(tree, {});
  const result = stringify(processedTree);
  
  expect(result).toContain('Visible');
  expect(result).toContain('Raw content');
});