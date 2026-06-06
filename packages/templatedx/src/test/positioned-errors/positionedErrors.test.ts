import { expect, test } from 'vitest';
import { bundle } from '../../bundler';
import { transformTree } from '../../transformer';
import { parse } from '../../ast-utils';
import { TemplateDXError } from '../../errors';

const contentLoader = async () => '';

async function catchError(promise: Promise<unknown>): Promise<TemplateDXError> {
  try {
    await promise;
  } catch (error) {
    return error as TemplateDXError;
  }
  throw new Error('expected promise to reject');
}

test('unsupported tag error carries the exact position of the tag', async () => {
  // <Bogus> opens at line 3, column 1 (1-based), offset 14 into the string.
  const input = 'Hello world.\n\n<Bogus>\n  content\n</Bogus>\n';

  const error = await catchError(bundle(input, __dirname, contentLoader));

  expect(error).toBeInstanceOf(TemplateDXError);
  expect(error.message).toBe(
    "Unsupported tag '<Bogus>'. Only native MDX elements, and registered tags are supported."
  );
  expect(error.line).toBe(3);
  expect(error.column).toBe(1);
  expect(error.offset).toBe(14);
  // End spans the closing tag (line 5, after `</Bogus>`).
  expect(error.endLine).toBe(5);
});

test('unregistered filter error points at the failing expression, not the document', async () => {
  const input = 'Line one.\n\nHello {bogusFilter(props.name)}!\n';
  const tree = parse(input);

  const error = await catchError(transformTree(tree, { name: 'x' }));

  expect(error).toBeInstanceOf(TemplateDXError);
  expect(error.message).toBe(
    'Error evaluating expression "bogusFilter(props.name)": Filter "bogusFilter" is not registered.'
  );
  // `{bogusFilter(props.name)}` starts at line 3, column 7 (offset 17) and is 25 chars wide.
  expect(error.line).toBe(3);
  expect(error.column).toBe(7);
  expect(error.offset).toBe(17);
  expect(error.endLine).toBe(3);
  expect(error.endColumn).toBe(32);
});

test('disallowed operator error carries the expression position', async () => {
  const input = '{props.name | upper}\n';
  const tree = parse(input);

  const error = await catchError(transformTree(tree, { name: 'x' }));

  expect(error).toBeInstanceOf(TemplateDXError);
  expect(error.message).toBe(
    'Error evaluating expression "props.name | upper": Operator "|" is not allowed.'
  );
  expect(error.line).toBe(1);
  expect(error.column).toBe(1);
  expect(error.offset).toBe(0);
});

test('expression error inside a nested element keeps the inner expression position', async () => {
  // The failing `{bogusFilter(1)}` is on line 2 — the wrapper <div> on line 1
  // must NOT clobber the inner position when it re-throws.
  const input = '<div>\n  value: {bogusFilter(1)}\n</div>\n';
  const tree = parse(input);

  const error = await catchError(transformTree(tree, {}));

  expect(error).toBeInstanceOf(TemplateDXError);
  expect(error.line).toBe(2);
  expect(error.column).toBe(10);
  expect(error.offset).toBe(15);
  // The message is the inner expression error, not the generic JSX wrapper.
  expect(error.message).toBe(
    'Error evaluating expression "bogusFilter(1)": Filter "bogusFilter" is not registered.'
  );
});

test('failed import load points at the import statement', async () => {
  const failingLoader = async () => {
    throw new Error('file not found');
  };
  const input = "import Foo from './foo.mdx';\n\n<Foo />\n";

  const error = await catchError(bundle(input, __dirname, failingLoader));

  expect(error).toBeInstanceOf(TemplateDXError);
  expect(error.message).toBe('Failed to load import "./foo.mdx": file not found');
  expect(error.line).toBe(1);
  expect(error.column).toBe(1);
});

test('position fields are undefined when no position is available', () => {
  const error = new TemplateDXError('no position');
  expect(error.position).toBeUndefined();
  expect(error.line).toBeUndefined();
  expect(error.offset).toBeUndefined();
});
