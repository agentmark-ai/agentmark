import { getInput, getOutput } from "../helpers";
import { expect, test } from 'vitest'
import { stringify, parse, transform } from "../../index";
import { ContentLoader } from "../../index";
import fs from 'fs';


test('handles filters', async () => {
  const input = getInput(__dirname);
  const loader: ContentLoader = async path => fs.readFileSync(path, 'utf-8');
  const tree = await parse(input, __dirname, loader);  const props = { obj: { a: 'b', c: [1, 2, 3]}}
  const compiled = stringify(await transform(tree, props));
  const output = getOutput(__dirname);
  expect(compiled).toEqual(output);
});