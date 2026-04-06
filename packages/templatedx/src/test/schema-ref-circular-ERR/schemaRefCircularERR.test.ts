import { describe, it, expect } from 'vitest';
import { resolveSchemaRefs, ContentLoader } from '../../index';

function createContentLoader(
  files: Record<string, unknown>
): ContentLoader {
  return async (path: string) => {
    const content = files[path];
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return JSON.stringify(content);
  };
}

describe('resolveSchemaRefs circular reference detection', () => {
  it('should throw with circular reference detected when schema refs itself (A->A)', async () => {
    const loader = createContentLoader({
      '/schemas/self.json': {
        type: 'object',
        properties: {
          nested: { $ref: './self.json' },
        },
      },
    });

    const schema = { $ref: './self.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrowError(/circular reference detected/);
  });

  it('should throw with circular reference detected when two schemas ref each other (A->B->A)', async () => {
    const loader = createContentLoader({
      '/schemas/a.json': {
        type: 'object',
        properties: {
          linkToB: { $ref: './b.json' },
        },
      },
      '/schemas/b.json': {
        type: 'object',
        properties: {
          linkToA: { $ref: './a.json' },
        },
      },
    });

    const schema = { $ref: './a.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrowError(/circular reference detected/);
  });

  it('should include the cycle path in the error for indirect circular refs (A->B->A)', async () => {
    const loader = createContentLoader({
      '/schemas/a.json': {
        type: 'object',
        properties: {
          linkToB: { $ref: './b.json' },
        },
      },
      '/schemas/b.json': {
        type: 'object',
        properties: {
          linkToA: { $ref: './a.json' },
        },
      },
    });

    const schema = { $ref: './a.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrowError(/\/schemas\/a\.json.*->.*\/schemas\/b\.json.*->.*\/schemas\/a\.json/);
  });

  it('should throw with circular reference detected for a three-way cycle (A->B->C->A)', async () => {
    const loader = createContentLoader({
      '/schemas/a.json': {
        type: 'object',
        properties: {
          linkToB: { $ref: './b.json' },
        },
      },
      '/schemas/b.json': {
        type: 'object',
        properties: {
          linkToC: { $ref: './c.json' },
        },
      },
      '/schemas/c.json': {
        type: 'object',
        properties: {
          linkToA: { $ref: './a.json' },
        },
      },
    });

    const schema = { $ref: './a.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrowError(/circular reference detected/);
  });

  it('should include the full cycle path in the error for three-way circular refs (A->B->C->A)', async () => {
    const loader = createContentLoader({
      '/schemas/a.json': {
        type: 'object',
        properties: {
          linkToB: { $ref: './b.json' },
        },
      },
      '/schemas/b.json': {
        type: 'object',
        properties: {
          linkToC: { $ref: './c.json' },
        },
      },
      '/schemas/c.json': {
        type: 'object',
        properties: {
          linkToA: { $ref: './a.json' },
        },
      },
    });

    const schema = { $ref: './a.json' };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrowError(
      /\/schemas\/a\.json.*->.*\/schemas\/b\.json.*->.*\/schemas\/c\.json.*->.*\/schemas\/a\.json/
    );
  });
});
