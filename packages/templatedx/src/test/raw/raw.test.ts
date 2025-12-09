import { getInput, getOutput } from "../helpers";
import { expect, test } from 'vitest'
import { stringify, transform } from "../../index";
import { parse } from "../../ast-utils";

test('raw tags', async () => {
  const input = getInput(__dirname);
  const tree = parse(input);
  const processed = await transform(tree);
  const compiled = stringify(processed);
  const output = getOutput(__dirname);
  expect(compiled).toEqual(output);
});