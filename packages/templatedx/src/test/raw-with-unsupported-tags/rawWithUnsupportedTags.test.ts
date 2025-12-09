import { expect, test } from 'vitest'
import { bundle } from "../../bundler";

const contentLoader = async () => '';

test('should ignore unsupported tags inside Raw tags but still error on unsupported tags outside', async () => {
  // This should NOT error because unsupported tags are inside Raw
  const inputWithRaw = `
<Raw>
<UnsupportedTag>This should not cause an error</UnsupportedTag>
<AnotherBadTag prop="value">
  <NestedUnsupportedTag />
</AnotherBadTag>
</Raw>
`;
  
  // Should not throw
  await expect(
    bundle(inputWithRaw, __dirname, contentLoader)
  ).resolves.toBeDefined();
});

test('should still error on unsupported tags outside Raw', async () => {
  // This should error because unsupported tag is outside Raw
  const inputWithUnsupportedOutside = `
<Raw>
<UnsupportedTag>This is fine</UnsupportedTag>
</Raw>

<UnsupportedTagOutsideRaw>This should cause an error</UnsupportedTagOutsideRaw>
`;
  
  await expect(
    bundle(inputWithUnsupportedOutside, __dirname, contentLoader)
  ).rejects.toThrowError(/Unsupported tag '<UnsupportedTagOutsideRaw>'/);
});

test('should allow nested Raw tags with unsupported content', async () => {
  const inputWithNestedRaw = `
<Raw>
Some text before
<UnsupportedTag>
  <Raw>
  <EvenMoreUnsupportedTags />
  </Raw>
</UnsupportedTag>
</Raw>
`;
  
  // Should not throw
  await expect(
    bundle(inputWithNestedRaw, __dirname, contentLoader)
  ).resolves.toBeDefined();
});