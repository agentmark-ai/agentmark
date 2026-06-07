import { expect, test } from 'vitest';
import { bundle } from '../../bundler';
import { transformTree } from '../../transformer';
import { parse } from '../../ast-utils';
import { TemplateDXError, recoverParseErrorPosition } from '../../errors';

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

test('unclosed flow tag at end of document recovers the opening tag position', async () => {
  // mdast-util-mdx-jsx raises this error with NO structured position (the
  // opening tag's range goes into the message text only) — parse() must
  // recover it. `<Derp>` opens at line 5, column 1, offset 26.
  const input = '<System>\nHello\n</System>\n\n<Derp>\n';

  const error = await catchError(bundle(input, __dirname, contentLoader));

  expect(error.message).toBe('Expected a closing tag for `<Derp>` (5:1-5:7)');
  expect((error as any).line).toBe(5);
  expect((error as any).column).toBe(1);
  expect((error as any).place).toEqual({
    start: { line: 5, column: 1, offset: 26 },
    end: { line: 5, column: 7, offset: 32 },
  });
});

test('nested unclosed flow tags recover the innermost open tag position', async () => {
  // The parser reports the top of the open-tag stack: `<User>` on line 2.
  const input = '<System>\n<User>\nhello\n';

  const error = await catchError(bundle(input, __dirname, contentLoader));

  expect(error.message).toBe('Expected a closing tag for `<User>` (2:1-2:7)');
  expect((error as any).line).toBe(2);
  expect((error as any).column).toBe(1);
  expect((error as any).place).toEqual({
    start: { line: 2, column: 1, offset: 9 },
    end: { line: 2, column: 7, offset: 15 },
  });
});

test('parser-reported positions are never overridden by ranges in the message text', async () => {
  // The mismatched-closing-tag error embeds the OPENING tag's range (1:1-1:9)
  // in its message but structurally carries the CLOSING tag's position
  // (line 3) — the structured position must win.
  const input = '<System>\nHello\n</User>\n';

  const error = await catchError(bundle(input, __dirname, contentLoader));

  expect(error.message).toContain('Unexpected closing tag `</User>`');
  expect((error as any).line).toBe(3);
  expect((error as any).column).toBe(1);
  expect((error as any).place.start.line).toBe(3);
});

/** A fixture shaped like the real family: the 3-arg `VFileMessage`
 * constructor splits its origin into these `source`/`ruleId` fields. */
const endTagMismatch = (message: string): Error =>
  Object.assign(new Error(message), {
    source: 'mdast-util-mdx-jsx',
    ruleId: 'end-tag-mismatch',
  });

test('recoverParseErrorPosition leaves errors without a parseable range untouched', () => {
  const plain = endTagMismatch('something went wrong');
  expect(recoverParseErrorPosition(plain, 'doc')).toBe(plain);
  expect((plain as any).place).toBeUndefined();
  expect((plain as any).line).toBeUndefined();

  // Non-object throws pass through unchanged.
  expect(recoverParseErrorPosition('string error', 'doc')).toBe('string error');
  expect(recoverParseErrorPosition(null, 'doc')).toBe(null);
});

test('recoverParseErrorPosition is scoped to the mdx-jsx end-tag-mismatch family', () => {
  // A parenthesized number pair in an arbitrary error must NOT become a
  // position — recovery engages only for the error family structurally
  // identified by the VFileMessage origin fields.
  const lookalike = new Error('Something odd happened (2:3)');
  expect(recoverParseErrorPosition(lookalike, 'ab\ncdef\n')).toBe(lookalike);
  expect((lookalike as any).place).toBeUndefined();
  expect((lookalike as any).line).toBeUndefined();

  const wrongRule = Object.assign(new Error('Bad thing (2:3)'), {
    source: 'mdast-util-mdx-jsx',
    ruleId: 'something-else',
  });
  expect(recoverParseErrorPosition(wrongRule, 'ab\ncdef\n')).toBe(wrongRule);
  expect((wrongRule as any).place).toBeUndefined();
});

test('recoverParseErrorPosition handles single-point `(L:C)` ranges', () => {
  const error = endTagMismatch('Expected a closing tag for `<x>` (2:3)');
  const result = recoverParseErrorPosition(error, 'ab\ncdef\n') as any;

  expect(result).toBe(error);
  expect(result.line).toBe(2);
  expect(result.column).toBe(3);
  expect(result.place).toEqual({
    start: { line: 2, column: 3, offset: 5 },
    end: { line: 2, column: 3, offset: 5 },
  });
});

test('recoverParseErrorPosition omits offsets that fall outside the source', () => {
  // A range pointing past EOF (e.g. positions relative to a different file)
  // still yields line/column, but no bogus offsets.
  const error = endTagMismatch('Expected a closing tag for `<X>` (9:1-9:4)');
  const result = recoverParseErrorPosition(error, 'one\ntwo\n') as any;

  expect(result.line).toBe(9);
  expect(result.place).toEqual({
    start: { line: 9, column: 1 },
    end: { line: 9, column: 4 },
  });
});
