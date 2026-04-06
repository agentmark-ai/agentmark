import { describe, it, expect } from 'vitest';
import { resolveSchemaRefs, ContentLoader } from '../../index';

function createContentLoader(
  files: Record<string, string>
): ContentLoader {
  return async (path: string) => {
    const content = files[path];
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  };
}

describe('resolveSchemaRefs error cases', () => {
  it('should throw file not found error when contentLoader throws for unknown path', async () => {
    const loader = createContentLoader({});

    const schema = { $ref: './missing.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrow('file not found');
  });

  it('should throw invalid JSON error when contentLoader returns unparseable content', async () => {
    const loader = createContentLoader({
      '/schemas/bad.json': 'not json {{{',
    });

    const schema = { $ref: './bad.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrow('not valid JSON');
  });

  it('should throw maximum resolution depth error when ref chain exceeds 50 levels', async () => {
    // Dynamically generate a chain: file-0.json -> file-1.json -> ... -> file-51.json
    // Each file contains a $ref to the next file in the chain.
    // file-51.json is a terminal schema with no $ref.
    const files: Record<string, string> = {};

    for (let i = 0; i <= 51; i++) {
      if (i < 51) {
        files[`/schemas/file-${i}.json`] = JSON.stringify({
          $ref: `./file-${i + 1}.json`,
        });
      } else {
        files[`/schemas/file-${i}.json`] = JSON.stringify({
          type: 'string',
        });
      }
    }

    const loader = createContentLoader(files);
    const schema = { $ref: './file-0.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrow('maximum resolution depth');
  });
});
