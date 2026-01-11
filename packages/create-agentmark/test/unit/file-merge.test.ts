import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  mergePackageJson,
  appendGitignore,
  appendEnv,
  shouldSkipFile,
} from '../../src/utils/file-merge.js';

describe('file-merge', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-merge-test-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  describe('mergePackageJson', () => {
    it('should return warning if package.json does not exist', () => {
      const result = mergePackageJson(tempDir, {}, {}, {});
      expect(result.success).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should add new dependencies without modifying existing', () => {
      const existing = {
        name: 'test-app',
        dependencies: { react: '^18.0.0' },
      };
      fs.writeJsonSync(path.join(tempDir, 'package.json'), existing);

      const result = mergePackageJson(
        tempDir,
        { '@agentmark-ai/cli': '^1.0.0' },
        {},
        {}
      );

      expect(result.success).toBe(true);
      expect(result.added).toContain('dependency: @agentmark-ai/cli@^1.0.0');

      const updated = fs.readJsonSync(path.join(tempDir, 'package.json'));
      expect(updated.dependencies.react).toBe('^18.0.0');
      expect(updated.dependencies['@agentmark-ai/cli']).toBe('^1.0.0');
    });

    it('should skip existing dependencies', () => {
      const existing = {
        dependencies: { dotenv: '^16.0.0' },
      };
      fs.writeJsonSync(path.join(tempDir, 'package.json'), existing);

      const result = mergePackageJson(
        tempDir,
        { dotenv: '^17.0.0' },
        {},
        {}
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toContain('dependency: dotenv (already exists)');

      const updated = fs.readJsonSync(path.join(tempDir, 'package.json'));
      expect(updated.dependencies.dotenv).toBe('^16.0.0'); // Unchanged
    });

    it('should add devDependencies', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {});

      const result = mergePackageJson(
        tempDir,
        {},
        { typescript: '^5.0.0' },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.added).toContain('devDependency: typescript@^5.0.0');

      const updated = fs.readJsonSync(path.join(tempDir, 'package.json'));
      expect(updated.devDependencies.typescript).toBe('^5.0.0');
    });

    it('should add scripts without conflict', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {
        scripts: { test: 'jest' },
      });

      const result = mergePackageJson(
        tempDir,
        {},
        {},
        { dev: 'agentmark dev' }
      );

      expect(result.success).toBe(true);
      expect(result.added).toContain('script: dev');

      const updated = fs.readJsonSync(path.join(tempDir, 'package.json'));
      expect(updated.scripts.dev).toBe('agentmark dev');
      expect(updated.scripts.test).toBe('jest'); // Preserved
    });

    it('should namespace scripts that conflict', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {
        scripts: { dev: 'next dev' },
      });

      const result = mergePackageJson(
        tempDir,
        {},
        {},
        { dev: 'agentmark dev' }
      );

      expect(result.success).toBe(true);
      expect(result.added).toContain('script: agentmark:dev (namespaced due to conflict)');
      expect(result.warnings.some((w) => w.includes('agentmark:dev'))).toBe(true);

      const updated = fs.readJsonSync(path.join(tempDir, 'package.json'));
      expect(updated.scripts.dev).toBe('next dev'); // Original preserved
      expect(updated.scripts['agentmark:dev']).toBe('agentmark dev'); // Namespaced
    });

    it('should preserve name, version, and other metadata', () => {
      const existing = {
        name: 'my-app',
        version: '1.0.0',
        author: 'Test Author',
        license: 'MIT',
      };
      fs.writeJsonSync(path.join(tempDir, 'package.json'), existing);

      mergePackageJson(tempDir, { test: '^1.0.0' }, {}, {});

      const updated = fs.readJsonSync(path.join(tempDir, 'package.json'));
      expect(updated.name).toBe('my-app');
      expect(updated.version).toBe('1.0.0');
      expect(updated.author).toBe('Test Author');
      expect(updated.license).toBe('MIT');
    });
  });

  describe('appendGitignore', () => {
    it('should create .gitignore if it does not exist', () => {
      const result = appendGitignore(tempDir, ['node_modules/', '.env']);

      expect(result.success).toBe(true);
      expect(result.added).toContain('node_modules/');
      expect(result.added).toContain('.env');

      const content = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
      expect(content).toContain('# AgentMark');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.env');
    });

    it('should append to existing .gitignore', () => {
      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'dist/\n*.log\n');

      const result = appendGitignore(tempDir, ['node_modules/', '.env']);

      expect(result.success).toBe(true);
      expect(result.added).toContain('node_modules/');

      const content = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
      expect(content).toContain('dist/'); // Original
      expect(content).toContain('*.log'); // Original
      expect(content).toContain('# AgentMark');
      expect(content).toContain('node_modules/'); // Added
    });

    it('should skip entries that already exist', () => {
      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n.env\n');

      const result = appendGitignore(tempDir, ['node_modules/', '.env', 'dist/']);

      expect(result.success).toBe(true);
      expect(result.skipped).toContain('node_modules/');
      expect(result.skipped).toContain('.env');
      expect(result.added).toContain('dist/');
    });

    it('should handle entries with/without trailing slashes', () => {
      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules\n');

      const result = appendGitignore(tempDir, ['node_modules/']);

      expect(result.success).toBe(true);
      expect(result.skipped).toContain('node_modules/'); // Should recognize as duplicate
    });

    it('should preserve comments and formatting', () => {
      const original = '# Build output\ndist/\n\n# Dependencies\nnode_modules/\n';
      fs.writeFileSync(path.join(tempDir, '.gitignore'), original);

      appendGitignore(tempDir, ['.env']);

      const content = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
      expect(content).toContain('# Build output');
      expect(content).toContain('# Dependencies');
    });
  });

  describe('appendEnv', () => {
    it('should create .env if it does not exist', () => {
      const result = appendEnv(tempDir, { OPENAI_API_KEY: 'test-key' });

      expect(result.success).toBe(true);
      expect(result.added).toContain('OPENAI_API_KEY');

      const content = fs.readFileSync(path.join(tempDir, '.env'), 'utf-8');
      expect(content).toContain('# AgentMark');
      expect(content).toContain('OPENAI_API_KEY=test-key');
    });

    it('should append to existing .env', () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'DATABASE_URL=postgres://...\n');

      const result = appendEnv(tempDir, { OPENAI_API_KEY: 'test-key' });

      expect(result.success).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, '.env'), 'utf-8');
      expect(content).toContain('DATABASE_URL=postgres://'); // Original
      expect(content).toContain('OPENAI_API_KEY=test-key'); // Added
    });

    it('should skip existing keys', () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'OPENAI_API_KEY=existing-key\n');

      const result = appendEnv(tempDir, { OPENAI_API_KEY: 'new-key' });

      expect(result.success).toBe(true);
      expect(result.skipped).toContain('OPENAI_API_KEY');

      const content = fs.readFileSync(path.join(tempDir, '.env'), 'utf-8');
      expect(content).toContain('OPENAI_API_KEY=existing-key'); // Unchanged
      expect(content).not.toContain('new-key');
    });

    it('should preserve comments', () => {
      const original = '# Database\nDATABASE_URL=postgres://...\n# Secret\nSECRET=abc\n';
      fs.writeFileSync(path.join(tempDir, '.env'), original);

      appendEnv(tempDir, { NEW_VAR: 'value' });

      const content = fs.readFileSync(path.join(tempDir, '.env'), 'utf-8');
      expect(content).toContain('# Database');
      expect(content).toContain('# Secret');
    });

    it('should handle keys with = in values', () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'URL=https://example.com?key=value\n');

      const result = appendEnv(tempDir, { URL: 'different' });

      expect(result.skipped).toContain('URL');
    });
  });

  describe('shouldSkipFile', () => {
    it('should return false for new projects', () => {
      expect(shouldSkipFile('index.ts', false, ['index.ts'])).toBe(false);
    });

    it('should return false for files not in skip list', () => {
      expect(shouldSkipFile('app.ts', true, ['index.ts'])).toBe(false);
    });

    it('should return true for skipped files in existing projects', () => {
      expect(shouldSkipFile('index.ts', true, ['index.ts', 'main.py'])).toBe(true);
    });
  });
});
