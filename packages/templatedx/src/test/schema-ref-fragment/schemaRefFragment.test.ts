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

describe('resolveSchemaRefs with JSON Pointer fragments', () => {
  it('should resolve to a specific definition when $ref contains a fragment pointer', async () => {
    const loader = createContentLoader({
      '/schemas/common.json': {
        definitions: {
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zip: { type: 'string' },
            },
            required: ['street', 'city'],
          },
          Name: {
            type: 'string',
          },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        address: { $ref: './common.json#/definitions/Address' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            zip: { type: 'string' },
          },
          required: ['street', 'city'],
        },
      },
    });
  });

  it('should resolve a deeply nested JSON pointer path', async () => {
    const loader = createContentLoader({
      '/schemas/common.json': {
        definitions: {
          contact: {
            email: {
              type: 'string',
              format: 'email',
            },
            phone: {
              type: 'string',
              pattern: '^\\+[0-9]{1,15}$',
            },
          },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        email: { $ref: './common.json#/definitions/contact/email' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
        },
      },
    });
  });

  it('should throw when JSON pointer references a non-existent path', async () => {
    const loader = createContentLoader({
      '/schemas/common.json': {
        definitions: {
          Address: { type: 'object' },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        missing: { $ref: './common.json#/definitions/NonExistent' },
      },
    };

    await expect(
      resolveSchemaRefs(schema, '/schemas', loader)
    ).rejects.toThrow(/JSON pointer/);
  });

  it('should resolve fragments using $defs (modern JSON Schema keyword)', async () => {
    const loader = createContentLoader({
      '/schemas/common.json': {
        $defs: {
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
            required: ['street', 'city'],
          },
          Color: {
            type: 'string',
            enum: ['red', 'green', 'blue'],
          },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        address: { $ref: './common.json#/$defs/Address' },
        color: { $ref: './common.json#/$defs/Color' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
          required: ['street', 'city'],
        },
        color: {
          type: 'string',
          enum: ['red', 'green', 'blue'],
        },
      },
    });
  });

  it('should resolve pointer segments with tilde-encoded characters', async () => {
    const loader = createContentLoader({
      '/schemas/special.json': {
        definitions: {
          'field~name': {
            type: 'string',
            description: 'field with tilde in name',
          },
          'path/name': {
            type: 'number',
            description: 'field with slash in name',
          },
        },
      },
    });

    // Per RFC 6901: ~0 encodes ~, ~1 encodes /
    const schemaTilde = {
      type: 'object',
      properties: {
        tildeField: {
          $ref: './special.json#/definitions/field~0name',
        },
      },
    };

    const resultTilde = await resolveSchemaRefs(
      schemaTilde,
      '/schemas',
      loader
    );

    expect(resultTilde).toEqual({
      type: 'object',
      properties: {
        tildeField: {
          type: 'string',
          description: 'field with tilde in name',
        },
      },
    });

    const schemaSlash = {
      type: 'object',
      properties: {
        slashField: {
          $ref: './special.json#/definitions/path~1name',
        },
      },
    };

    const resultSlash = await resolveSchemaRefs(
      schemaSlash,
      '/schemas',
      loader
    );

    expect(resultSlash).toEqual({
      type: 'object',
      properties: {
        slashField: {
          type: 'number',
          description: 'field with slash in name',
        },
      },
    });
  });
});
