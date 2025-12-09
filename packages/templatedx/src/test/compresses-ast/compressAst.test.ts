import fs from 'fs';
import { getInput } from "../helpers";
import { expect, test } from 'vitest'
import { parse, ContentLoader, stringify, compressAst } from "../../index";

test('compresses an ast', async () => {
  const input = getInput(__dirname);
  const loader: ContentLoader = async path => fs.readFileSync(path, 'utf-8');
  const bundled = await parse(input, __dirname, loader);
  // Cloning, because compressing mutates the tree.
  const uncompressedAst = structuredClone(bundled);
  compressAst(bundled);
  expect(bundled).toMatchFileSnapshot('./node.json');
  const compressed = await stringify(bundled);
  const uncompressed = await stringify(uncompressedAst);
  expect(compressed).toEqual(uncompressed);
});