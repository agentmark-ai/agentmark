import { describe, it, expect } from 'vitest';
import {
  resolveSchemaRefs,
  resolveAstSchemaRefs,
  parse,
  getFrontMatter,
  ContentLoader,
} from '../../index';

/**
 * Backward compatibility regression tests for $ref resolution.
 *
 * These tests verify that existing prompts without $ref values, or with
 * mixed inline + $ref schemas, are handled correctly -- i.e., the $ref
 * resolution feature does not break any pre-existing behavior.
 */

// ---------------------------------------------------------------------------
// Helper: contentLoader that should never be called
// ---------------------------------------------------------------------------

function createNeverCalledLoader(): ContentLoader {
  return async (path: string) => {
    throw new Error(
      `contentLoader should not have been called, but was called with: ${path}`
    );
  };
}

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

// ===========================================================================
// resolveSchemaRefs: pure schema resolution
// ===========================================================================

describe('resolveSchemaRefs backward compatibility', () => {
  it('should return a flat schema with no $ref unchanged', async () => {
    const loader = createNeverCalledLoader();
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['name', 'age'],
    };

    const result = await resolveSchemaRefs(schema, '/any', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['name', 'age'],
    });
  });

  it('should preserve every property of a deeply nested inline schema', async () => {
    const loader = createNeverCalledLoader();
    const schema = {
      type: 'object',
      title: 'UserProfile',
      description: 'A user profile schema',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        contacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['email', 'phone'] },
              value: { type: 'string' },
            },
            required: ['kind', 'value'],
          },
          minItems: 1,
        },
        metadata: {
          type: 'object',
          additionalProperties: true,
        },
      },
      required: ['name'],
      additionalProperties: false,
    };

    const result = await resolveSchemaRefs(schema, '/any', loader);

    expect(result).toEqual(schema);
  });

  it('should preserve inline properties alongside resolved $ref properties', async () => {
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
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' },
        address: { $ref: './address.json' },
        age: { type: 'integer', minimum: 0 },
      },
      required: ['name', 'email'],
    };

    const result = await resolveSchemaRefs(schema, '/schemas', loader);

    expect(result).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
        age: { type: 'integer', minimum: 0 },
      },
      required: ['name', 'email'],
    });
  });

  it('should preserve schema keywords like additionalProperties, allOf, anyOf, oneOf', async () => {
    const loader = createNeverCalledLoader();
    const schema = {
      type: 'object',
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
      anyOf: [
        { type: 'string' },
        { type: 'number' },
      ],
      oneOf: [
        { const: 'yes' },
        { const: 'no' },
      ],
      additionalProperties: false,
    };

    const result = await resolveSchemaRefs(schema, '/any', loader);

    expect(result).toEqual(schema);
  });

  it('should handle an empty properties object without error', async () => {
    const loader = createNeverCalledLoader();
    const schema = {
      type: 'object',
      properties: {},
    };

    const result = await resolveSchemaRefs(schema, '/any', loader);

    expect(result).toEqual({ type: 'object', properties: {} });
  });
});

// ===========================================================================
// resolveAstSchemaRefs: AST-level backward compatibility
// ===========================================================================

describe('resolveAstSchemaRefs backward compatibility', () => {
  it('should leave a prompt with object_config.schema but no $ref unchanged', async () => {
    const mdx = `---
name: test-object-prompt
object_config:
  model_name: gpt-4
  schema:
    type: object
    properties:
      result:
        type: string
      confidence:
        type: number
    required:
      - result
---

Generate a response.
`;

    const loader = createNeverCalledLoader();
    const ast = await parse(mdx, '/test', loader);
    const frontmatterBefore = JSON.parse(
      JSON.stringify(getFrontMatter(ast))
    );

    await resolveAstSchemaRefs(ast, '/test', loader);

    const frontmatterAfter = getFrontMatter(ast) as Record<string, unknown>;
    const objectConfig = frontmatterAfter['object_config'] as Record<string, unknown>;
    const schema = objectConfig['schema'] as Record<string, unknown>;

    expect(schema).toEqual({
      type: 'object',
      properties: {
        result: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['result'],
    });
    // Verify the frontmatter structure is fully preserved
    expect(frontmatterAfter['name']).toBe('test-object-prompt');
    expect((objectConfig as Record<string, unknown>)['model_name']).toBe('gpt-4');
  });

  it('should leave a prompt with input_schema but no $ref unchanged', async () => {
    const mdx = `---
name: test-input-prompt
text_config:
  model_name: gpt-4
input_schema:
  type: object
  properties:
    query:
      type: string
    limit:
      type: integer
      minimum: 1
      maximum: 100
  required:
    - query
---

Search for {props.query}
`;

    const loader = createNeverCalledLoader();
    const ast = await parse(mdx, '/test', loader);

    await resolveAstSchemaRefs(ast, '/test', loader);

    const frontmatter = getFrontMatter(ast) as Record<string, unknown>;
    const inputSchema = frontmatter['input_schema'] as Record<string, unknown>;

    expect(inputSchema).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['query'],
    });
  });

  it('should leave a prompt with neither object_config nor input_schema unchanged', async () => {
    const mdx = `---
name: simple-prompt
text_config:
  model_name: gpt-4
---

Hello world
`;

    const loader = createNeverCalledLoader();
    const ast = await parse(mdx, '/test', loader);
    const frontmatterBefore = JSON.parse(
      JSON.stringify(getFrontMatter(ast))
    );

    await resolveAstSchemaRefs(ast, '/test', loader);

    const frontmatterAfter = getFrontMatter(ast) as Record<string, unknown>;
    expect(frontmatterAfter).toEqual(frontmatterBefore);
  });

  it('should resolve $ref in input_schema while preserving other frontmatter fields', async () => {
    const loader = createContentLoader({
      '/test/schemas/user.json': {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
    });

    const mdx = `---
name: user-prompt
text_config:
  model_name: gpt-4
  temperature: 0.7
input_schema:
  type: object
  properties:
    user:
      $ref: ./schemas/user.json
    message:
      type: string
  required:
    - user
    - message
---

Hello {props.user.name}, your message: {props.message}
`;

    const ast = await parse(mdx, '/test', loader);
    await resolveAstSchemaRefs(ast, '/test', loader);

    const frontmatter = getFrontMatter(ast) as Record<string, unknown>;

    // Verify non-schema frontmatter is preserved
    expect(frontmatter['name']).toBe('user-prompt');
    const textConfig = frontmatter['text_config'] as Record<string, unknown>;
    expect(textConfig['model_name']).toBe('gpt-4');
    expect(textConfig['temperature']).toBe(0.7);

    // Verify $ref was resolved
    const inputSchema = frontmatter['input_schema'] as Record<string, unknown>;
    const properties = inputSchema['properties'] as Record<string, unknown>;
    const user = properties['user'] as Record<string, unknown>;
    expect(user).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
    });

    // Verify inline property preserved
    const message = properties['message'] as Record<string, unknown>;
    expect(message).toEqual({ type: 'string' });

    // Verify required array preserved
    expect(inputSchema['required']).toEqual(['user', 'message']);
  });

  it('should resolve $ref in object_config.schema while preserving inline properties', async () => {
    const loader = createContentLoader({
      '/test/schemas/contact.json': {
        type: 'object',
        properties: {
          phone: { type: 'string' },
          address: { type: 'string' },
        },
      },
    });

    const mdx = `---
name: contact-prompt
object_config:
  model_name: gpt-4
  schema:
    type: object
    properties:
      name:
        type: string
      contact:
        $ref: ./schemas/contact.json
      notes:
        type: string
    required:
      - name
      - contact
---

Extract contact info.
`;

    const ast = await parse(mdx, '/test', loader);
    await resolveAstSchemaRefs(ast, '/test', loader);

    const frontmatter = getFrontMatter(ast) as Record<string, unknown>;
    const objectConfig = frontmatter['object_config'] as Record<string, unknown>;
    const schema = objectConfig['schema'] as Record<string, unknown>;
    const properties = schema['properties'] as Record<string, unknown>;

    // Inline properties preserved
    expect(properties['name']).toEqual({ type: 'string' });
    expect(properties['notes']).toEqual({ type: 'string' });

    // $ref resolved
    expect(properties['contact']).toEqual({
      type: 'object',
      properties: {
        phone: { type: 'string' },
        address: { type: 'string' },
      },
    });

    // required preserved
    expect(schema['required']).toEqual(['name', 'contact']);
  });
});
