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

describe('resolveSchemaRefs', () => {
  it('should resolve a top-level $ref to the referenced file content', async () => {
    const loader = createContentLoader({
      '/schemas/user.json': {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    });

    const schema = { $ref: './user.json' };
    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });

  it('should resolve a $ref nested inside properties', async () => {
    const loader = createContentLoader({
      '/schemas/address.json': {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { $ref: './address.json' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
    });
  });

  it('should resolve a $ref inside array items', async () => {
    const loader = createContentLoader({
      '/schemas/item.json': {
        type: 'object',
        properties: { id: { type: 'number' } },
      },
    });

    const schema = {
      type: 'array',
      items: { $ref: './item.json' },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'number' } },
      },
    });
  });

  it('should return schema unchanged when no $refs are present', async () => {
    const loader = createContentLoader({});

    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual(schema);
  });

  it('should preserve non-object values like strings, numbers, booleans, and null', async () => {
    const loader = createContentLoader({});

    const schema = {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      default: null,
      deprecated: false,
      title: 'Username',
    };

    const result = await resolveSchemaRefs(
      schema as Record<string, unknown>,
      '/schemas',
      loader
    );

    expect(result).toEqual({
      type: 'string',
      minLength: 1,
      maxLength: 255,
      default: null,
      deprecated: false,
      title: 'Username',
    });
  });

  it('should drop sibling properties when $ref is present', async () => {
    const loader = createContentLoader({
      '/schemas/address.json': {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        address: {
          $ref: './address.json',
          description: 'Home address',
          title: 'Address',
        },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    // $ref replaces the entire object — siblings like description and title are dropped
    expect(result).toEqual({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
    });

    // Explicitly verify siblings are gone
    expect((result as any).properties.address.description).toBeUndefined();
    expect((result as any).properties.address.title).toBeUndefined();
  });

  it('should resolve multiple different $refs in the same schema', async () => {
    const loader = createContentLoader({
      '/schemas/name.json': {
        type: 'object',
        properties: { first: { type: 'string' }, last: { type: 'string' } },
      },
      '/schemas/email.json': {
        type: 'string',
        format: 'email',
      },
    });

    const schema = {
      type: 'object',
      properties: {
        name: { $ref: './name.json' },
        email: { $ref: './email.json' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        name: {
          type: 'object',
          properties: { first: { type: 'string' }, last: { type: 'string' } },
        },
        email: {
          type: 'string',
          format: 'email',
        },
      },
    });
  });
});
