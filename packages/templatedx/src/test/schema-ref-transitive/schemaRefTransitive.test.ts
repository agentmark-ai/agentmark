import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveSchemaRefs, resolveAstSchemaRefs, parse, getFrontMatter, ContentLoader } from '../../index';

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

describe('resolveSchemaRefs — transitive $ref resolution', () => {
  it('should resolve a two-level A→B→C transitive $ref chain', async () => {
    const loader = createContentLoader({
      '/schemas/user.json': {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { $ref: './address.json' },
        },
      },
      '/schemas/address.json': {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
          zip: { type: 'string' },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        user: { $ref: './user.json' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                zip: { type: 'string' },
              },
            },
          },
        },
      },
    });
  });

  it('should resolve a deep chain of 5+ transitive $refs', async () => {
    const loader = createContentLoader({
      '/schemas/level1.json': {
        type: 'object',
        properties: {
          value: { type: 'string', const: 'L1' },
          next: { $ref: './level2.json' },
        },
      },
      '/schemas/level2.json': {
        type: 'object',
        properties: {
          value: { type: 'string', const: 'L2' },
          next: { $ref: './level3.json' },
        },
      },
      '/schemas/level3.json': {
        type: 'object',
        properties: {
          value: { type: 'string', const: 'L3' },
          next: { $ref: './level4.json' },
        },
      },
      '/schemas/level4.json': {
        type: 'object',
        properties: {
          value: { type: 'string', const: 'L4' },
          next: { $ref: './level5.json' },
        },
      },
      '/schemas/level5.json': {
        type: 'object',
        properties: {
          value: { type: 'string', const: 'L5' },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        root: { $ref: './level1.json' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        root: {
          type: 'object',
          properties: {
            value: { type: 'string', const: 'L1' },
            next: {
              type: 'object',
              properties: {
                value: { type: 'string', const: 'L2' },
                next: {
                  type: 'object',
                  properties: {
                    value: { type: 'string', const: 'L3' },
                    next: {
                      type: 'object',
                      properties: {
                        value: { type: 'string', const: 'L4' },
                        next: {
                          type: 'object',
                          properties: {
                            value: { type: 'string', const: 'L5' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('should resolve a transitive $ref where the intermediate file uses a fragment pointer', async () => {
    const loader = createContentLoader({
      '/schemas/person.json': {
        type: 'object',
        properties: {
          name: { type: 'string' },
          location: { $ref: './geo.json#/definitions/Coordinate' },
        },
      },
      '/schemas/geo.json': {
        definitions: {
          Coordinate: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
            },
          },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        person: { $ref: './person.json' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        person: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            location: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
          },
        },
      },
    });
  });
});

describe('end-to-end through parse pipeline', () => {
  const fixtureDir = path.resolve(__dirname);

  const fileContentLoader: ContentLoader = async (filePath: string) => {
    return fs.readFileSync(filePath, 'utf-8');
  };

  it('should resolve transitive $refs through parse + resolveAstSchemaRefs', async () => {
    const input = fs.readFileSync(path.join(fixtureDir, 'input.mdx'), 'utf-8');

    const ast = await parse(input, fixtureDir, fileContentLoader);
    await resolveAstSchemaRefs(ast, fixtureDir, fileContentLoader);

    const frontmatter = getFrontMatter(ast) as Record<string, unknown>;
    const inputSchema = frontmatter['input_schema'] as Record<string, unknown>;
    const properties = inputSchema['properties'] as Record<string, unknown>;
    const user = properties['user'] as Record<string, unknown>;

    // First-level ref resolved: user has its own properties
    expect(user).toHaveProperty('type', 'object');
    const userProps = user['properties'] as Record<string, unknown>;
    expect(userProps).toHaveProperty('name');
    expect((userProps['name'] as Record<string, unknown>)['type']).toBe('string');

    // Transitive ref resolved: address is fully inlined
    const address = userProps['address'] as Record<string, unknown>;
    expect(address).toHaveProperty('type', 'object');
    const addressProps = address['properties'] as Record<string, unknown>;
    expect(addressProps).toHaveProperty('street');
    expect((addressProps['street'] as Record<string, unknown>)['type']).toBe('string');
    expect(addressProps).toHaveProperty('city');
    expect((addressProps['city'] as Record<string, unknown>)['type']).toBe('string');

    // No residual $ref keys remain
    expect(user).not.toHaveProperty('$ref');
    expect(address).not.toHaveProperty('$ref');
  });

  it('should detect circular references through the full pipeline', async () => {
    const circularMdx = `---
name: circular-test
text_config:
  model_name: test-model
input_schema:
  type: object
  properties:
    node:
      $ref: ./node.json
---

Content
`;

    const circularLoader: ContentLoader = async (filePath: string) => {
      if (filePath.endsWith('node.json')) {
        return JSON.stringify({
          type: 'object',
          properties: {
            value: { type: 'string' },
            child: { $ref: './node.json' },
          },
        });
      }
      throw new Error(`File not found: ${filePath}`);
    };

    const ast = await parse(circularMdx, '/test', circularLoader);

    await expect(
      resolveAstSchemaRefs(ast, '/test', circularLoader)
    ).rejects.toThrow('circular reference detected');
  });
});
