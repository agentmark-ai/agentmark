import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

describe('agentmark build', () => {
  const testDir = path.join(__dirname, 'test-build-project');
  const agentmarkDir = path.join(testDir, 'agentmark');
  const outputDir = path.join(testDir, 'dist', 'agentmark');
  const cliPath = path.join(__dirname, '..', 'dist', 'index.js');

  beforeEach(async () => {
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
  model_name: gpt-4o
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
  model_name: gpt-4o
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
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.remove(testDir);
  });

  it('builds all prompts and datasets', async () => {
    // Run build command
    execSync(`node ${cliPath} build`, { cwd: testDir, stdio: 'pipe' });

    // Check output directory exists
    expect(await fs.pathExists(outputDir)).toBe(true);

    // Check prompt files were built
    expect(await fs.pathExists(path.join(outputDir, 'greeting.prompt.json'))).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'parser.prompt.json'))).toBe(true);

    // Check dataset was copied
    expect(await fs.pathExists(path.join(outputDir, 'test-data.jsonl'))).toBe(true);

    // Check manifest was created
    expect(await fs.pathExists(path.join(outputDir, 'manifest.json'))).toBe(true);
  });

  it('creates valid JSON with AST and metadata', async () => {
    execSync(`node ${cliPath} build`, { cwd: testDir, stdio: 'pipe' });

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

  it('creates manifest with all prompts and datasets', async () => {
    execSync(`node ${cliPath} build`, { cwd: testDir, stdio: 'pipe' });

    const manifest = await fs.readJson(path.join(outputDir, 'manifest.json'));

    expect(manifest.version).toBe('1.0');
    expect(manifest.builtAt).toBeDefined();

    // Check prompts list
    expect(manifest.prompts).toHaveLength(2);
    expect(manifest.prompts.map((p: any) => p.path)).toContain('greeting.prompt.mdx');
    expect(manifest.prompts.map((p: any) => p.path)).toContain('parser.prompt.mdx');

    // Check datasets list
    expect(manifest.datasets).toContain('test-data.jsonl');
  });

  it('supports custom output directory via --out flag', async () => {
    const customOut = path.join(testDir, 'custom-output');

    execSync(`node ${cliPath} build --out ${customOut}`, { cwd: testDir, stdio: 'pipe' });

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
  model_name: gpt-4o
---

<User>Hello</User>
`
    );

    execSync(`node ${cliPath} build`, { cwd: testDir, stdio: 'pipe' });

    // Check nested output was created
    expect(await fs.pathExists(path.join(outputDir, 'nested', 'deep', 'nested.prompt.json'))).toBe(true);

    const manifest = await fs.readJson(path.join(outputDir, 'manifest.json'));
    expect(manifest.prompts.map((p: any) => p.path)).toContain('nested/deep/nested.prompt.mdx');
  });

  it('correctly identifies object prompts', async () => {
    execSync(`node ${cliPath} build`, { cwd: testDir, stdio: 'pipe' });

    const parserPrompt = await fs.readJson(path.join(outputDir, 'parser.prompt.json'));
    expect(parserPrompt.metadata.kind).toBe('object');
  });

  it('fails gracefully with invalid prompt', async () => {
    // Create an invalid prompt
    await fs.writeFile(
      path.join(agentmarkDir, 'invalid.prompt.mdx'),
      `---
name: invalid
---

<User>No config defined</User>
`
    );

    // Should exit with error code
    let exitCode = 0;
    try {
      execSync(`node ${cliPath} build`, { cwd: testDir, stdio: 'pipe' });
    } catch (error: any) {
      exitCode = error.status;
    }

    expect(exitCode).toBe(1);

    // But valid prompts should still be built
    expect(await fs.pathExists(path.join(outputDir, 'greeting.prompt.json'))).toBe(true);
  });

  it('throws error when agentmark.json is missing', async () => {
    await fs.remove(path.join(testDir, 'agentmark.json'));

    let threw = false;
    try {
      execSync(`node ${cliPath} build`, { cwd: testDir, stdio: 'pipe' });
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
  });
});
