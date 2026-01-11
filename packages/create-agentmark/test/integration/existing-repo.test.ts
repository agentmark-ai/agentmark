import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectProjectInfo } from '../../src/utils/project-detection.js';
import { mergePackageJson, appendGitignore, appendEnv } from '../../src/utils/file-merge.js';
import { detectPackageManager } from '../../src/utils/package-manager.js';

describe('Existing Repository Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-integration-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  describe('TypeScript Project Detection and Merge (User Story 1)', () => {
    it('should detect existing Next.js project structure', () => {
      // Simulate Next.js project
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {
        name: 'my-nextjs-app',
        version: '1.0.0',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
      });
      fs.writeJsonSync(path.join(tempDir, 'tsconfig.json'), { compilerOptions: {} });
      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n.next/\n');
      fs.writeFileSync(path.join(tempDir, '.env'), 'DATABASE_URL=postgres://localhost\n');

      const projectInfo = detectProjectInfo(tempDir);

      expect(projectInfo.isExistingProject).toBe(true);
      expect(projectInfo.type).toBe('typescript');
      expect(projectInfo.conflictingFiles.length).toBeGreaterThan(0);
    });

    it('should merge package.json without overwriting existing dependencies', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {
        name: 'my-app',
        scripts: { dev: 'next dev', build: 'next build' },
        dependencies: { react: '^18.0.0', dotenv: '^16.0.0' },
      });

      const result = mergePackageJson(
        tempDir,
        { '@agentmark-ai/cli': '^1.0.0', dotenv: '^17.0.0' }, // dotenv should be skipped
        { typescript: '^5.0.0' },
        { dev: 'agentmark dev', prompt: 'agentmark run-prompt' } // dev should be namespaced
      );

      expect(result.success).toBe(true);

      const updatedPkg = fs.readJsonSync(path.join(tempDir, 'package.json'));

      // Existing dependencies preserved
      expect(updatedPkg.dependencies.react).toBe('^18.0.0');
      expect(updatedPkg.dependencies.dotenv).toBe('^16.0.0'); // Not updated

      // New dependencies added
      expect(updatedPkg.dependencies['@agentmark-ai/cli']).toBe('^1.0.0');
      expect(updatedPkg.devDependencies.typescript).toBe('^5.0.0');

      // Script namespacing
      expect(updatedPkg.scripts.dev).toBe('next dev'); // Preserved
      expect(updatedPkg.scripts['agentmark:dev']).toBe('agentmark dev'); // Namespaced
      expect(updatedPkg.scripts.prompt).toBe('agentmark run-prompt'); // No conflict
    });

    it('should append to .gitignore without duplicating entries', () => {
      fs.writeFileSync(
        path.join(tempDir, '.gitignore'),
        '# Build\nnode_modules/\n.next/\ndist/\n'
      );

      const result = appendGitignore(tempDir, [
        'node_modules/',
        '.env',
        '*.agentmark-outputs/',
        '.agentmark/',
        'dist/',
      ]);

      expect(result.success).toBe(true);
      expect(result.skipped).toContain('node_modules/');
      expect(result.skipped).toContain('dist/');
      expect(result.added).toContain('.env');
      expect(result.added).toContain('*.agentmark-outputs/');
      expect(result.added).toContain('.agentmark/');

      const content = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
      expect(content).toContain('# Build');
      expect(content).toContain('.next/');
      expect(content).toContain('# AgentMark');
      expect(content).toContain('.agentmark/');
    });

    it('should append to .env without overwriting existing keys', () => {
      fs.writeFileSync(
        path.join(tempDir, '.env'),
        'DATABASE_URL=postgres://localhost\nOPENAI_API_KEY=existing-key\n'
      );

      const result = appendEnv(tempDir, {
        OPENAI_API_KEY: 'new-key',
        ANTHROPIC_API_KEY: 'claude-key',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toContain('OPENAI_API_KEY');
      expect(result.added).toContain('ANTHROPIC_API_KEY');

      const content = fs.readFileSync(path.join(tempDir, '.env'), 'utf-8');
      expect(content).toContain('DATABASE_URL=postgres://localhost');
      expect(content).toContain('OPENAI_API_KEY=existing-key'); // Unchanged
      expect(content).not.toContain('new-key');
      expect(content).toContain('ANTHROPIC_API_KEY=claude-key');
    });
  });

  describe('Package Manager Detection (User Story 1)', () => {
    it('should detect yarn from yarn.lock', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {});
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');

      const pm = detectPackageManager(tempDir);
      expect(pm.name).toBe('yarn');
      expect(pm.addCmd).toBe('yarn add');
      expect(pm.addDevCmd).toBe('yarn add --dev');
    });

    it('should detect pnpm from pnpm-lock.yaml', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {});
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');

      const pm = detectPackageManager(tempDir);
      expect(pm.name).toBe('pnpm');
      expect(pm.addCmd).toBe('pnpm add');
      expect(pm.addDevCmd).toBe('pnpm add --save-dev');
    });

    it('should detect bun from bun.lockb', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {});
      fs.writeFileSync(path.join(tempDir, 'bun.lockb'), '');

      const pm = detectPackageManager(tempDir);
      expect(pm.name).toBe('bun');
      expect(pm.addCmd).toBe('bun add');
      expect(pm.addDevCmd).toBe('bun add --dev');
    });
  });

  describe('Python Project Detection (User Story 2)', () => {
    it('should detect existing FastAPI project', () => {
      // Simulate FastAPI project
      fs.writeFileSync(
        path.join(tempDir, 'pyproject.toml'),
        `[project]
name = "my-fastapi-app"
version = "0.1.0"
dependencies = ["fastapi", "uvicorn"]
`
      );
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'fastapi\nuvicorn\n');
      fs.mkdirSync(path.join(tempDir, '.venv', 'bin'), { recursive: true });

      const projectInfo = detectProjectInfo(tempDir);

      expect(projectInfo.isExistingProject).toBe(true);
      expect(projectInfo.type).toBe('python');
      expect(projectInfo.pythonVenv).not.toBe(null);
      expect(projectInfo.pythonVenv?.name).toBe('.venv');
    });

    it('should detect venv directory', () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'fastapi\n');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      fs.mkdirSync(path.join(tempDir, 'venv', binDir), { recursive: true });

      const projectInfo = detectProjectInfo(tempDir);

      expect(projectInfo.pythonVenv).not.toBe(null);
      expect(projectInfo.pythonVenv?.name).toBe('venv');
    });
  });

  describe('Current Directory Initialization (User Story 3)', () => {
    it('should detect project in current directory', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {
        name: 'current-dir-app',
      });

      const projectInfo = detectProjectInfo(tempDir);

      expect(projectInfo.isExistingProject).toBe(true);
      expect(projectInfo.type).toBe('typescript');
    });
  });

  describe('Conflict Detection (User Story 4)', () => {
    it('should detect agentmark.json as conflict', () => {
      fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), {
        version: '1.0.0',
      });

      const projectInfo = detectProjectInfo(tempDir);

      const agentmarkConflict = projectInfo.conflictingFiles.find(
        (f) => f.path === 'agentmark.json'
      );
      expect(agentmarkConflict).toBeDefined();
      expect(agentmarkConflict?.strategy).toBe('prompt');
    });

    it('should detect agentmark directory as conflict', () => {
      fs.mkdirSync(path.join(tempDir, 'agentmark'));
      fs.writeFileSync(
        path.join(tempDir, 'agentmark', 'test.prompt.mdx'),
        '---\nname: test\n---'
      );

      const projectInfo = detectProjectInfo(tempDir);

      const agentmarkDirConflict = projectInfo.conflictingFiles.find(
        (f) => f.path === 'agentmark'
      );
      expect(agentmarkDirConflict).toBeDefined();
      expect(agentmarkDirConflict?.type).toBe('directory');
    });

    it('should identify merge strategy for package.json', () => {
      fs.writeJsonSync(path.join(tempDir, 'package.json'), {});

      const projectInfo = detectProjectInfo(tempDir);

      const pkgJsonConflict = projectInfo.conflictingFiles.find(
        (f) => f.path === 'package.json'
      );
      expect(pkgJsonConflict).toBeDefined();
      expect(pkgJsonConflict?.strategy).toBe('merge');
    });

    it('should identify append strategy for .gitignore', () => {
      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n');

      const projectInfo = detectProjectInfo(tempDir);

      const gitignoreConflict = projectInfo.conflictingFiles.find(
        (f) => f.path === '.gitignore'
      );
      expect(gitignoreConflict).toBeDefined();
      expect(gitignoreConflict?.strategy).toBe('append');
    });

    it('should identify append strategy for .env', () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET=value\n');

      const projectInfo = detectProjectInfo(tempDir);

      const envConflict = projectInfo.conflictingFiles.find((f) => f.path === '.env');
      expect(envConflict).toBeDefined();
      expect(envConflict?.strategy).toBe('append');
    });
  });

  describe('Full Integration Scenario', () => {
    it('should handle complete Next.js project initialization workflow', () => {
      // Setup: Simulate existing Next.js project
      const pkgJson = {
        name: 'my-nextjs-app',
        version: '1.0.0',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          lint: 'next lint',
        },
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
          '@types/react': '^18.0.0',
        },
      };

      fs.writeJsonSync(path.join(tempDir, 'package.json'), pkgJson);
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      fs.writeJsonSync(path.join(tempDir, 'tsconfig.json'), {});
      fs.writeFileSync(
        path.join(tempDir, '.gitignore'),
        'node_modules/\n.next/\n.env*.local\n'
      );
      fs.writeFileSync(path.join(tempDir, '.env'), 'DATABASE_URL=postgres://localhost\n');

      // Step 1: Detect project
      const projectInfo = detectProjectInfo(tempDir);
      expect(projectInfo.isExistingProject).toBe(true);
      expect(projectInfo.type).toBe('typescript');
      expect(projectInfo.packageManager.name).toBe('yarn');

      // Step 2: Merge package.json
      const mergeResult = mergePackageJson(
        tempDir,
        { '@agentmark-ai/prompt-core': '^1.0.0', '@agentmark-ai/sdk': '^1.0.0' },
        { '@agentmark-ai/cli': '^1.0.0' },
        {
          dev: 'agentmark dev',
          prompt: 'agentmark run-prompt',
          experiment: 'agentmark run-experiment',
        }
      );

      expect(mergeResult.success).toBe(true);

      // Verify package.json
      const updatedPkg = fs.readJsonSync(path.join(tempDir, 'package.json'));
      expect(updatedPkg.scripts.dev).toBe('next dev'); // Preserved
      expect(updatedPkg.scripts['agentmark:dev']).toBe('agentmark dev'); // Namespaced
      expect(updatedPkg.scripts.prompt).toBe('agentmark run-prompt'); // Added
      expect(updatedPkg.dependencies['@agentmark-ai/prompt-core']).toBe('^1.0.0');
      expect(updatedPkg.devDependencies['@agentmark-ai/cli']).toBe('^1.0.0');
      expect(updatedPkg.devDependencies.typescript).toBe('^5.0.0'); // Preserved

      // Step 3: Append to .gitignore
      const gitignoreResult = appendGitignore(tempDir, [
        'node_modules/',
        '.env',
        '*.agentmark-outputs/',
        '.agentmark/',
      ]);

      expect(gitignoreResult.success).toBe(true);
      const gitignoreContent = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
      expect(gitignoreContent).toContain('.next/'); // Original
      expect(gitignoreContent).toContain('.agentmark/'); // Added

      // Step 4: Append to .env
      const envResult = appendEnv(tempDir, {
        OPENAI_API_KEY: 'your-key-here',
      });

      expect(envResult.success).toBe(true);
      const envContent = fs.readFileSync(path.join(tempDir, '.env'), 'utf-8');
      expect(envContent).toContain('DATABASE_URL=postgres://localhost'); // Original
      expect(envContent).toContain('OPENAI_API_KEY=your-key-here'); // Added
    });
  });
});
