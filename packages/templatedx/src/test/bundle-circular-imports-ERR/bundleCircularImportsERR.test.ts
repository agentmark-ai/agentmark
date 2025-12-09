import fs from 'fs';
import { getInput } from "../helpers";
import { expect, test } from 'vitest'
import { parse, ContentLoader } from "../../index";

test('should throw an error on circular imports', async () => {
  const input = getInput(__dirname);
  const loader: ContentLoader = async path => fs.readFileSync(path, 'utf-8');
  const bundledFn = async () => await parse(input, __dirname, loader);
  expect(bundledFn).rejects.toThrowError();
});