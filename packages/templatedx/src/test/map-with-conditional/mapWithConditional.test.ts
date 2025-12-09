import { getInput, getOutput } from "../helpers";
import { expect, test } from 'vitest'
import { stringify, parse, transform } from "../../index";
import { ContentLoader } from "../../index";
import fs from 'fs';

const props = {
  messageHistory: [
    {
      role: 'system',
      message: 'ignored'
    },
    {
      role: 'user',
      message: "What's 2 + 2?"
    },
    {
      role: 'assistant',
      message: '5',
    },
    {
      role: 'user',
      message: "What's 10 + 2?"
    },
    {
      role: 'assistant',
      message: '5'
    }
  ]
};

test('maps over arrays', async () => {
  const input = getInput(__dirname);
  const loader: ContentLoader = async path => fs.readFileSync(path, 'utf-8');
  const tree = await parse(input, __dirname, loader);
  const processed = await transform(tree, props);
  const compiled = stringify(processed);
  const output = getOutput(__dirname);
  expect(compiled).toEqual(output);
});