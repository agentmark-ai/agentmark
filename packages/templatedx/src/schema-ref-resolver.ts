import type { ContentLoader } from './types';
import type { Root } from 'mdast';
import { resolvePath, getDirname } from './utils';
import { getFrontMatter } from './ast-utils';
import yaml from 'js-yaml';

const MAX_RESOLUTION_DEPTH = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsRef(obj: unknown): boolean {
  if (!isPlainObject(obj) && !Array.isArray(obj)) {
    return false;
  }
  if (isPlainObject(obj)) {
    if ('$ref' in obj && typeof obj['$ref'] === 'string') {
      return true;
    }
    for (const val of Object.values(obj)) {
      if (containsRef(val)) return true;
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (containsRef(item)) return true;
    }
  }
  return false;
}

function resolveJsonPointer(
  obj: Record<string, unknown>,
  pointer: string,
  filePath: string
): unknown {
  const segments = pointer.split('/').filter(Boolean);
  let current: unknown = obj;

  for (const segment of segments) {
    const decoded = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isPlainObject(current)) {
      throw new Error(
        `Schema $ref error: JSON pointer "${pointer}" not found in "${filePath}"`
      );
    }
    if (!(decoded in (current as Record<string, unknown>))) {
      throw new Error(
        `Schema $ref error: JSON pointer "${pointer}" not found in "${filePath}"`
      );
    }
    current = (current as Record<string, unknown>)[decoded];
  }

  return current;
}

async function resolveValue(
  value: unknown,
  baseDir: string,
  contentLoader: ContentLoader,
  visited: Set<string>
): Promise<unknown> {
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value) {
      result.push(await resolveValue(item, baseDir, contentLoader, visited));
    }
    return result;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const obj = value as Record<string, unknown>;

  // Check if this object is a $ref
  if ('$ref' in obj && typeof obj['$ref'] === 'string') {
    return resolveRef(obj['$ref'], baseDir, contentLoader, visited);
  }

  // Recursively resolve all properties
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = await resolveValue(val, baseDir, contentLoader, visited);
  }
  return result;
}

async function resolveRef(
  ref: string,
  baseDir: string,
  contentLoader: ContentLoader,
  visited: Set<string>
): Promise<unknown> {
  const [filePath, fragment] = ref.split('#');

  if (!filePath) {
    // Local fragment-only references (e.g. "#/definitions/Foo") are self-contained
    // within the schema — skip resolution and leave them as-is.
    return { $ref: ref };
  }

  const resolvedPath = resolvePath(baseDir, filePath);
  const currentRef = fragment ? `${resolvedPath}#${fragment}` : resolvedPath;

  // Check circular reference
  if (visited.has(currentRef)) {
    throw new Error(
      `Schema $ref error: circular reference detected: ${[...visited, currentRef].join(' -> ')}`
    );
  }

  // Check depth limit
  if (visited.size >= MAX_RESOLUTION_DEPTH) {
    throw new Error(
      `Schema $ref error: maximum resolution depth (${MAX_RESOLUTION_DEPTH}) exceeded`
    );
  }

  const newVisited = new Set(visited);
  newVisited.add(currentRef);

  // Load the file
  let content: string;
  try {
    content = await contentLoader(resolvedPath);
  } catch (cause) {
    throw new Error(
      `Schema $ref error: file not found "${resolvedPath}" (referenced from "${baseDir}")`,
      { cause }
    );
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new Error(`Schema $ref error: "${resolvedPath}" is not valid JSON`, { cause });
  }

  if (!isPlainObject(parsed)) {
    throw new Error(
      `Schema $ref error: "${resolvedPath}" must be a JSON object`
    );
  }

  // Resolve fragment if present
  let resolved: unknown = parsed;
  if (fragment) {
    resolved = resolveJsonPointer(
      parsed as Record<string, unknown>,
      fragment,
      resolvedPath
    );
  }

  // Recursively resolve any $refs in the loaded schema
  const resolvedDir = getDirname(resolvedPath);
  return resolveValue(resolved, resolvedDir, contentLoader, newVisited);
}

export async function resolveSchemaRefs(
  schema: Record<string, unknown>,
  baseDir: string,
  contentLoader: ContentLoader,
  visited?: Set<string>
): Promise<Record<string, unknown>> {
  const result = await resolveValue(
    schema,
    baseDir,
    contentLoader,
    visited ?? new Set<string>()
  );
  return result as Record<string, unknown>;
}

export async function resolveAstSchemaRefs(
  ast: Root,
  baseDir: string,
  contentLoader: ContentLoader
): Promise<void> {
  const frontmatter = getFrontMatter(ast) as Record<string, unknown> | undefined;
  if (!frontmatter || !isPlainObject(frontmatter)) {
    return;
  }

  let updated = false;

  const inputSchema = frontmatter['input_schema'];
  if (isPlainObject(inputSchema) && containsRef(inputSchema)) {
    frontmatter['input_schema'] = await resolveSchemaRefs(
      inputSchema as Record<string, unknown>,
      baseDir,
      contentLoader
    );
    updated = true;
  }

  const objectConfig = frontmatter['object_config'] as Record<string, unknown> | undefined;
  if (isPlainObject(objectConfig)) {
    const objectSchema = objectConfig['schema'];
    if (isPlainObject(objectSchema) && containsRef(objectSchema)) {
      objectConfig['schema'] = await resolveSchemaRefs(
        objectSchema as Record<string, unknown>,
        baseDir,
        contentLoader
      );
      updated = true;
    }
  }

  if (updated) {
    const yamlNode = ast.children.find(
      (node): node is typeof node & { value: string } => node.type === 'yaml'
    );
    if (!yamlNode) {
      throw new Error(
        'Schema $ref error: resolved schemas but could not find YAML frontmatter node to write back'
      );
    }

    // Parse existing YAML, update schema fields, stringify back
    let existingFrontmatter: Record<string, unknown>;
    try {
      existingFrontmatter = yaml.load(yamlNode.value) as Record<string, unknown>;
    } catch (cause) {
      throw new Error(
        'Schema $ref error: failed to update AST frontmatter YAML after $ref resolution',
        { cause }
      );
    }

    if (frontmatter['input_schema']) {
      existingFrontmatter['input_schema'] = frontmatter['input_schema'];
    }
    if (isPlainObject(objectConfig)) {
      const existingObjectConfig = existingFrontmatter['object_config'] as Record<string, unknown> | undefined;
      if (isPlainObject(existingObjectConfig)) {
        existingObjectConfig['schema'] = objectConfig['schema'];
      }
    }

    yamlNode.value = yaml.dump(existingFrontmatter, { lineWidth: -1 }).trim();
  }
}
