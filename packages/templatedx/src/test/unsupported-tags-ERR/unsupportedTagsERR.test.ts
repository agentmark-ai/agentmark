import { expect, test } from 'vitest'
import { bundle } from "../../bundler";
import { getInput } from "../helpers";

const contentLoader = async () => '';

test('should throw an error on unsupported tags', async () => {
  const input = getInput(__dirname);
  
  await expect(
    bundle(input, __dirname, contentLoader)
  ).rejects.toThrowError(/Unsupported tag '<CustomTag>'/);
});

test('should throw specific error for CustomTag', async () => {
  const input = `<CustomTag>Content</CustomTag>`;
  
  await expect(
    bundle(input, __dirname, contentLoader)
  ).rejects.toThrowError(
    "Unsupported tag '<CustomTag>'. Only native MDX elements, and registered tags are supported."
  );
});

test('should throw specific error for made-up tag', async () => {
  const input = `<RandomMadeUpTag>Content</RandomMadeUpTag>`;
  
  await expect(
    bundle(input, __dirname, contentLoader)
  ).rejects.toThrowError(
    "Unsupported tag '<RandomMadeUpTag>'. Only native MDX elements, and registered tags are supported."
  );
});

test('should ignore unsupported tags inside Raw tags', async () => {
  const input = `
<Raw>
<CustomTag>This should not error</CustomTag>
<AnotherUnsupportedTag>Content</AnotherUnsupportedTag>
</Raw>
`;
  
  // Should not throw any errors
  await expect(
    bundle(input, __dirname, contentLoader)
  ).resolves.toBeDefined();
});