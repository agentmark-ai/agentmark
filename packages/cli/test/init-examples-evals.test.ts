import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createExamplePrompts } from '../src/utils/examples/templates';

describe('init examples include evals', () => {
  it('party-planner prompt includes evals list', async () => {
    const tmpDir = path.join(__dirname, '..', 'tmp-examples-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      createExamplePrompts('gpt-4o', tmpDir);
      const filePath = path.join(tmpDir, 'agentmark', 'party-planner.prompt.mdx');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('test_settings:');
      expect(content).toContain('evals:');
      expect(content).toContain('- exact_match_json');
    } finally {
      // cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
