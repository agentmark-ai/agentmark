import fs from 'fs';
import { getInput } from "../helpers";
import { expect, test } from 'vitest'
import { parse, ContentLoader } from "../../index";

test('should throw error for undefined components', async () => {
  const input = getInput(__dirname);
  const loader: ContentLoader = async path => fs.readFileSync(path, 'utf-8');
  
  await expect(
    parse(input, __dirname, loader)
  ).rejects.toThrowError(/Unsupported tag '<MyComponent>'/);
});