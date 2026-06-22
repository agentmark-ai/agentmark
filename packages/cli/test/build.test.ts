import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import build from '../cli-src/commands/build';

// `build` is a plain in-process async function: it reads `process.cwd()` and
// writes compiled prompts to `dist/agentmark`. These tests call it directly
// rather than spawning `node <cli> build`, matching the other cli command
// tests (e.g. generate-schema). No subprocess means no cold-start timeout
// flake on CI, and we exercise the build logic itself instead of the bundle.
describe('agentmark build', () => {
  const testDir = path.join(__dirname, 'test-build-project');
  const agentmarkDir = path.join(testDir, 'agentmark');
  const outputDir = path.join(testDir, 'dist', 'agentmark');
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();

    // build() logs progress to the console; keep test output readable.
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create test project structure
    await fs.ensureDir(agentmarkDir);

    // Create agentmark.json
    await fs.writeJson(path.join(testDir, 'agentmark.json'), {
      version: '2.0.0',
      mdxVersion: '1.0',
      agentmarkPath: '.',
    });

    // Create a text prompt
    await fs.writeFile(
      path.join(agentmarkDir, 'greeting.prompt.mdx'),
      `---
name: greeting
text_config:
  model_name: openai/gpt-4o
test_settings:
  props:
    name: World
---

<System>
You are a friendly greeter.
</System>

<User>
Say hello to {props.name}!
</User>
`
    );

    // Create an object prompt
    await fs.writeFile(
      path.join(agentmarkDir, 'parser.prompt.mdx'),
      `---
name: parser
object_config:
  model_name: openai/gpt-4o
  schema:
    type: object
    properties:
      items:
        type: array
        items:
          type: string
    required:
      - items
test_settings:
  props:
    text: "apple, banana, cherry"
---

<System>
Parse the comma-separated list into an array.
</System>

<User>
{props.text}
</User>
`
    );

    // Create a dataset file
    await fs.writeFile(
      path.join(agentmarkDir, 'test-data.jsonl'),
      `{"input": {"name": "Alice"}, "expected_output": "Hello Alice!"}
{"input": {"name": "Bob"}, "expected_output": "Hello Bob!"}
`
    );

    // build() resolves paths from process.cwd(); point it at the fixture.
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    // Cleanup test directory
    await fs.remove(testDir);
  });

  it('builds all prompts', async () => {
    await build();

    // Check output directory exists
    expect(await fs.pathExists(outputDir)).toBe(true);

    // Check prompt files were built
    expect(await fs.pathExists(path.join(outputDir, 'greeting.prompt.json'))).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'parser.prompt.json'))).toBe(true);

    // Datasets ARE copied verbatim alongside the compiled prompts so
    // FileLoader can resolve them at runtime. Without this, a built
    // prompt that references `test-data.jsonl` in its frontmatter
    // would throw "Dataset not found" because the file would exist
    // only in source, not in the build output FileLoader points at.
    expect(await fs.pathExists(path.join(outputDir, 'test-data.jsonl'))).toBe(true);
    const copiedDataset = await fs.readFile(
      path.join(outputDir, 'test-data.jsonl'),
      'utf-8',
    );
    expect(copiedDataset).toContain('"name": "Alice"');
    expect(copiedDataset).toContain('"name": "Bob"');

    // Check manifest was created
    expect(await fs.pathExists(path.join(outputDir, 'manifest.json'))).toBe(true);
  });

  it('creates valid JSON with AST and metadata', async () => {
    await build();

    const greetingPrompt = await fs.readJson(path.join(outputDir, 'greeting.prompt.json'));

    // Check structure
    expect(greetingPrompt).toHaveProperty('ast');
    expect(greetingPrompt).toHaveProperty('metadata');

    // Check metadata
    expect(greetingPrompt.metadata.path).toBe('greeting.prompt.mdx');
    expect(greetingPrompt.metadata.kind).toBe('text');
    expect(greetingPrompt.metadata.name).toBe('greeting');
    expect(greetingPrompt.metadata.builtAt).toBeDefined();

    // Check AST has expected structure
    expect(greetingPrompt.ast.type).toBe('root');
    expect(Array.isArray(greetingPrompt.ast.children)).toBe(true);
  });

  it('creates manifest with all prompts', async () => {
    await build();

    const manifest = await fs.readJson(path.join(outputDir, 'manifest.json'));

    expect(manifest.version).toBe('1.0');
    expect(manifest.builtAt).toBeDefined();

    // Check prompts list
    expect(manifest.prompts).toHaveLength(2);
    expect(manifest.prompts.map((p: any) => p.path)).toContain('greeting.prompt.mdx');
    expect(manifest.prompts.map((p: any) => p.path)).toContain('parser.prompt.mdx');

    // Manifest should not include datasets
    expect(manifest.datasets).toBeUndefined();
  });

  it('supports custom output directory via --out flag', async () => {
    const customOut = path.join(testDir, 'custom-output');

    await build({ outDir: customOut });

    expect(await fs.pathExists(customOut)).toBe(true);
    expect(await fs.pathExists(path.join(customOut, 'greeting.prompt.json'))).toBe(true);
    expect(await fs.pathExists(path.join(customOut, 'manifest.json'))).toBe(true);
  });

  it('handles nested directories', async () => {
    // Create nested prompt
    const nestedDir = path.join(agentmarkDir, 'nested', 'deep');
    await fs.ensureDir(nestedDir);
    await fs.writeFile(
      path.join(nestedDir, 'nested.prompt.mdx'),
      `---
name: nested
text_config:
  model_name: openai/gpt-4o
---

<User>Hello</User>
`
    );

    await build();

    // Check nested output was created
    expect(await fs.pathExists(path.join(outputDir, 'nested', 'deep', 'nested.prompt.json'))).toBe(true);

    const manifest = await fs.readJson(path.join(outputDir, 'manifest.json'));
    expect(manifest.prompts.map((p: any) => p.path)).toContain('nested/deep/nested.prompt.mdx');
  });

  it('correctly identifies object prompts', async () => {
    await build();

    const parserPrompt = await fs.readJson(path.join(outputDir, 'parser.prompt.json'));
    expect(parserPrompt.metadata.kind).toBe('object');
  });

  it('fails gracefully with invalid prompt', async () => {
    // Create an invalid prompt (no *_config in frontmatter)
    await fs.writeFile(
      path.join(agentmarkDir, 'invalid.prompt.mdx'),
      `---
name: invalid
---

<User>No config defined</User>
`
    );

    // build() calls process.exit(1) once any prompt fails to compile; intercept
    // it so the test runner survives and we can assert on the exit code.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);

    await expect(build()).rejects.toThrow('process.exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);

    // But valid prompts should still be built
    expect(await fs.pathExists(path.join(outputDir, 'greeting.prompt.json'))).toBe(true);
  });

  it('throws error when agentmark.json is missing', async () => {
    await fs.remove(path.join(testDir, 'agentmark.json'));

    await expect(build()).rejects.toThrow();
  });
});
