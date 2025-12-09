import { getInput } from "../helpers";
import { expect, test } from 'vitest'
import { transform } from "../../index";
import { parse } from "../../ast-utils";

const props = {
  num: 4,
};

test('replaces function props', async () => {
  const input = getInput(__dirname);
  const tree = parse(input);
  const processedFn = async () => transform(tree, props);
  expect(processedFn).rejects.toThrowError();
});