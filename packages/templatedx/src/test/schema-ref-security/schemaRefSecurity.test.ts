import { describe, it, expect, vi } from 'vitest';
import { resolveSchemaRefs, ContentLoader } from '../../index';
import { resolvePath } from '../../utils';

/**
 * Security tests for $ref resolution.
 *
 * The resolver itself does NOT enforce path boundaries -- it delegates path
 * resolution to `resolvePath()` and hands the result to the caller-provided
 * `contentLoader`. Path traversal guards live in each CLI entry point
 * (build.ts, run-prompt.ts), where the contentLoader rejects resolved paths
 * outside the allowed directory.
 *
 * These tests verify:
 *   (a) What the resolver passes to the contentLoader for various $ref values.
 *   (b) That the CLI-style contentLoader pattern correctly rejects traversal.
 *   (c) That normal relative paths continue to work (positive control).
 */

// ---------------------------------------------------------------------------
// Helper: spy contentLoader that records which paths it receives
// ---------------------------------------------------------------------------

function createSpyLoader(
  files: Record<string, unknown>
): { loader: ContentLoader; calledPaths: string[] } {
  const calledPaths: string[] = [];
  const loader: ContentLoader = async (path: string) => {
    calledPaths.push(path);
    const content = files[path];
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return JSON.stringify(content);
  };
  return { loader, calledPaths };
}

// ---------------------------------------------------------------------------
// Helper: CLI-style guarded contentLoader (mirrors build.ts / run-prompt.ts)
// ---------------------------------------------------------------------------

function createGuardedLoader(
  allowedDir: string,
  files: Record<string, unknown>
): ContentLoader {
  return async (resolvedPath: string) => {
    // Mirrors the fixed CLI pattern: baseDir + separator to prevent prefix collisions
    if (!resolvedPath.startsWith(allowedDir + '/') && resolvedPath !== allowedDir) {
      throw new Error(
        `Access denied: path outside source directory: ${resolvedPath}`
      );
    }
    const content = files[resolvedPath];
    if (content === undefined) {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    return JSON.stringify(content);
  };
}

// ===========================================================================
// Part 1: Resolver passes $ref paths through to contentLoader
// ===========================================================================

describe('resolveSchemaRefs path resolution behavior', () => {
  it('should pass the resolved path of a normal relative $ref to the contentLoader', async () => {
    const { loader, calledPaths } = createSpyLoader({
      '/project/schemas/user.json': {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    });

    const schema = { $ref: './user.json' };
    const result = await resolveSchemaRefs(schema, '/project/schemas', loader);

    expect(calledPaths).toEqual(['/project/schemas/user.json']);
    expect(result).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });

  it('should resolve a parent-directory traversal $ref and pass the resolved path to contentLoader', async () => {
    // NOTE: This test documents current behavior -- the resolver itself
    // does NOT block path traversal. The guard must be in the contentLoader.
    const { loader, calledPaths } = createSpyLoader({
      '/etc/passwd': { type: 'string' },
    });

    const schema = { $ref: '../../../etc/passwd' };
    await resolveSchemaRefs(schema, '/project/schemas', loader);

    // resolvePath('/project/schemas', '../../../etc/passwd') pops all segments
    const expectedPath = resolvePath('/project/schemas', '../../../etc/passwd');
    expect(calledPaths).toEqual([expectedPath]);
  });

  it('should resolve an absolute $ref and pass it directly to contentLoader', async () => {
    // NOTE: resolvePath returns absolute paths as-is
    const { loader, calledPaths } = createSpyLoader({
      '/etc/passwd': { type: 'string' },
    });

    const schema = { $ref: '/etc/passwd' };
    await resolveSchemaRefs(schema, '/project/schemas', loader);

    expect(calledPaths).toEqual(['/etc/passwd']);
  });

  it('should pass a file URI scheme $ref as a resolved path to contentLoader', async () => {
    // The resolver treats "file:///etc/passwd" as a relative path segment,
    // NOT as a URI. It gets resolved relative to baseDir.
    const { loader, calledPaths } = createSpyLoader({});

    const schema = { $ref: 'file:///etc/passwd' };
    // This will fail at the contentLoader because the resolved path won't match
    // any file -- that's fine, we just want to verify it doesn't fetch a URL.
    await expect(
      resolveSchemaRefs(schema, '/project/schemas', loader)
    ).rejects.toThrow('file not found');

    // The resolver should have called the contentLoader, not fetched over HTTP.
    expect(calledPaths.length).toBe(1);
    expect(calledPaths[0]).toContain('file:');
  });

  it('should pass an HTTP URL $ref as a resolved path to contentLoader without fetching', async () => {
    // The resolver does not recognize URL schemes -- it resolves as a relative
    // path and passes to the contentLoader. No network request should be made.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { loader, calledPaths } = createSpyLoader({});

    const schema = { $ref: 'https://evil.com/schema.json' };
    await expect(
      resolveSchemaRefs(schema, '/project/schemas', loader)
    ).rejects.toThrow('file not found');

    // No fetch should have been called
    expect(fetchSpy).not.toHaveBeenCalled();
    // The contentLoader was called with a path, not a URL fetch
    expect(calledPaths.length).toBe(1);

    fetchSpy.mockRestore();
  });
});

// ===========================================================================
// Part 2: CLI-style guarded contentLoader rejects traversal
// ===========================================================================

describe('guarded contentLoader (CLI pattern) rejects path traversal', () => {
  const allowedDir = '/project/agentmark';

  // NOTE: The resolver wraps all contentLoader errors as "file not found"
  // (see schema-ref-resolver.ts lines 128-135). The original "Access denied"
  // error from the guarded loader ends up as the `cause` of the thrown error.
  // These tests verify the guarded loader is invoked and the resolver rejects,
  // then check the error cause to confirm the access denial was the reason.

  it('should reject a $ref that traverses above the allowed directory', async () => {
    const loader = createGuardedLoader(allowedDir, {});

    const schema = { $ref: '../../package.json' };

    const error = await resolveSchemaRefs(
      schema,
      '/project/agentmark/schemas',
      loader
    ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('file not found');
    expect((error as any).cause?.message).toContain('Access denied');
  });

  it('should reject a $ref to /etc/passwd via parent traversal', async () => {
    const loader = createGuardedLoader(allowedDir, {});

    const schema = { $ref: '../../../etc/passwd' };

    const error = await resolveSchemaRefs(
      schema,
      '/project/agentmark/schemas',
      loader
    ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('file not found');
    expect((error as any).cause?.message).toContain('Access denied');
  });

  it('should reject an absolute path $ref outside the allowed directory', async () => {
    const loader = createGuardedLoader(allowedDir, {});

    const schema = { $ref: '/etc/passwd' };

    const error = await resolveSchemaRefs(
      schema,
      '/project/agentmark/schemas',
      loader
    ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('file not found');
    expect((error as any).cause?.message).toContain('Access denied');
  });

  it('should reject a file URI scheme $ref', async () => {
    const loader = createGuardedLoader(allowedDir, {});

    const schema = { $ref: 'file:///etc/passwd' };

    await expect(
      resolveSchemaRefs(schema, '/project/agentmark/schemas', loader)
    ).rejects.toThrow('file not found');
  });

  it('should allow a $ref that stays within the allowed directory', async () => {
    const loader = createGuardedLoader(allowedDir, {
      '/project/agentmark/schemas/user.json': {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    });

    const schema = { $ref: './user.json' };
    const result = await resolveSchemaRefs(
      schema,
      '/project/agentmark/schemas',
      loader
    );

    expect(result).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });

  it('should allow a $ref using subdirectories within the allowed directory', async () => {
    const loader = createGuardedLoader(allowedDir, {
      '/project/agentmark/schemas/common/address.json': {
        type: 'object',
        properties: { city: { type: 'string' } },
      },
    });

    const schema = { $ref: './common/address.json' };
    const result = await resolveSchemaRefs(
      schema,
      '/project/agentmark/schemas',
      loader
    );

    expect(result).toEqual({
      type: 'object',
      properties: { city: { type: 'string' } },
    });
  });
});

// ===========================================================================
// Part 3: resolvePath unit tests for security-relevant edge cases
// ===========================================================================

describe('resolvePath security-relevant behavior', () => {
  it('should resolve excessive parent traversal by stopping at root', () => {
    const result = resolvePath('/project/schemas', '../../../etc/passwd');

    // After popping /project and /schemas, there's nothing left to pop,
    // so ../../../etc/passwd resolves to /etc/passwd
    expect(result).toBe('/etc/passwd');
  });

  it('should return absolute paths unchanged', () => {
    const result = resolvePath('/project/schemas', '/etc/passwd');
    expect(result).toBe('/etc/passwd');
  });

  it('should resolve a safe relative path correctly', () => {
    const result = resolvePath('/project/schemas', './user.json');
    expect(result).toBe('/project/schemas/user.json');
  });

  it('should resolve a single parent traversal within the tree', () => {
    const result = resolvePath('/project/schemas/sub', '../shared.json');
    expect(result).toBe('/project/schemas/shared.json');
  });
});

// ===========================================================================
// Part 4: Prefix collision guard (baseDir + separator)
// ===========================================================================

describe('guarded contentLoader rejects prefix collisions', () => {
  it('should reject a path that matches baseDir as a prefix but is a different directory', async () => {
    // /project/app vs /project/application — startsWith('/project/app') would
    // incorrectly pass without the trailing separator guard.
    const allowedDir = '/project/app';
    const loader = createGuardedLoader(allowedDir, {});

    const schema = { $ref: './evil.json' };

    const error = await resolveSchemaRefs(
      schema,
      '/project/application',
      loader
    ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('file not found');
    expect((error as any).cause?.message).toContain('Access denied');
  });

  it('should allow a path that is within baseDir even with similar sibling names', async () => {
    const allowedDir = '/project/app';
    const loader = createGuardedLoader(allowedDir, {
      '/project/app/schemas/user.json': {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    });

    const schema = { $ref: './user.json' };
    const result = await resolveSchemaRefs(
      schema,
      '/project/app/schemas',
      loader
    );

    expect(result).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });
});

// ===========================================================================
// Part 5: Fragment-only $ref passthrough
// ===========================================================================

describe('fragment-only $ref handling', () => {
  it('should pass through fragment-only $ref (#/definitions/Foo) without resolving', async () => {
    const { loader, calledPaths } = createSpyLoader({});

    const schema = {
      type: 'object',
      properties: {
        address: { $ref: '#/definitions/Address' },
        name: { type: 'string' },
      },
      definitions: {
        Address: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    };

    const result = await resolveSchemaRefs(schema, '/project/schemas', loader);

    // Fragment-only refs should be preserved as-is, not resolved via contentLoader
    expect(calledPaths).toEqual([]);
    expect((result as any).properties.address).toEqual({ $ref: '#/definitions/Address' });
    // Non-ref properties are preserved
    expect((result as any).properties.name).toEqual({ type: 'string' });
    expect((result as any).definitions).toBeDefined();
  });

  it('should pass through $ref with empty fragment (#) without resolving', async () => {
    const { loader, calledPaths } = createSpyLoader({});

    const schema = {
      type: 'object',
      properties: {
        self: { $ref: '#' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/project/schemas', loader);

    expect(calledPaths).toEqual([]);
    expect((result as any).properties.self).toEqual({ $ref: '#' });
  });

  it('should resolve file $ref with fragment but pass through fragment-only $ref in same schema', async () => {
    const { loader, calledPaths } = createSpyLoader({
      '/project/schemas/common.json': {
        definitions: {
          Address: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      },
    });

    const schema = {
      type: 'object',
      properties: {
        // File + fragment — should resolve
        address: { $ref: './common.json#/definitions/Address' },
        // Fragment-only — should pass through
        local: { $ref: '#/definitions/Name' },
      },
      definitions: {
        Name: { type: 'string' },
      },
    };

    const result = await resolveSchemaRefs(schema, '/project/schemas', loader);

    // File ref was resolved via contentLoader
    expect(calledPaths).toEqual(['/project/schemas/common.json']);
    expect((result as any).properties.address).toEqual({
      type: 'object',
      properties: { city: { type: 'string' } },
    });
    // Fragment-only ref preserved
    expect((result as any).properties.local).toEqual({ $ref: '#/definitions/Name' });
  });
});
