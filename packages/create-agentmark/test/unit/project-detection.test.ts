import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  detectTypeScriptProject,
  detectPythonProject,
  detectPackageManager,
  detectPythonVenv,
  detectConflictingFiles,
  detectProjectInfo,
  isCurrentDirectory,
} from '../../src/utils/project-detection.js';

describe('project-detection', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-test-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  describe('detectTypeScriptProject', () => {
    it('should return false for empty directory', () => {
      expect(detectTypeScriptProject(tempDir)).toBe(false);
    });

    it('should return true if package.json exists', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      expect(detectTypeScriptProject(tempDir)).toBe(true);
    });

    it('should return true if tsconfig.json exists', () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      expect(detectTypeScriptProject(tempDir)).toBe(true);
    });

    it('should return true if node_modules exists', () => {
      fs.mkdirSync(path.join(tempDir, 'node_modules'));
      expect(detectTypeScriptProject(tempDir)).toBe(true);
    });
  });

  describe('detectPythonProject', () => {
    it('should return false for empty directory', () => {
      expect(detectPythonProject(tempDir)).toBe(false);
    });

    it('should return true if pyproject.toml exists', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '');
      expect(detectPythonProject(tempDir)).toBe(true);
    });

    it('should return true if requirements.txt exists', () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), '');
      expect(detectPythonProject(tempDir)).toBe(true);
    });

    it('should return true if setup.py exists', () => {
      fs.writeFileSync(path.join(tempDir, 'setup.py'), '');
      expect(detectPythonProject(tempDir)).toBe(true);
    });

    it('should return true if .venv exists', () => {
      fs.mkdirSync(path.join(tempDir, '.venv'));
      expect(detectPythonProject(tempDir)).toBe(true);
    });

    it('should return true if venv exists', () => {
      fs.mkdirSync(path.join(tempDir, 'venv'));
      expect(detectPythonProject(tempDir)).toBe(true);
    });
  });

  describe('detectPackageManager', () => {
    it('should default to npm for empty directory', () => {
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('npm');
    });

    it('should detect yarn from yarn.lock', () => {
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('yarn');
      expect(result.addCmd).toBe('yarn add');
    });

    it('should detect pnpm from pnpm-lock.yaml', () => {
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('pnpm');
      expect(result.addDevCmd).toBe('pnpm add --save-dev');
    });

    it('should detect bun from bun.lockb', () => {
      fs.writeFileSync(path.join(tempDir, 'bun.lockb'), '');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('bun');
    });

    it('should detect npm from package-lock.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('npm');
    });

    it('should prefer yarn over npm when both lock files exist', () => {
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('yarn');
    });
  });

  describe('detectPythonVenv', () => {
    it('should return null for empty directory', () => {
      expect(detectPythonVenv(tempDir)).toBe(null);
    });

    it('should return null for directory without bin/Scripts', () => {
      fs.mkdirSync(path.join(tempDir, '.venv'));
      expect(detectPythonVenv(tempDir)).toBe(null);
    });

    it('should detect .venv with bin directory (Unix)', () => {
      const venvPath = path.join(tempDir, '.venv');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      fs.mkdirSync(path.join(venvPath, binDir), { recursive: true });

      const result = detectPythonVenv(tempDir);
      expect(result).not.toBe(null);
      expect(result?.name).toBe('.venv');
      expect(result?.path).toBe(venvPath);
    });

    it('should prefer .venv over venv', () => {
      const venv1 = path.join(tempDir, '.venv');
      const venv2 = path.join(tempDir, 'venv');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';

      fs.mkdirSync(path.join(venv1, binDir), { recursive: true });
      fs.mkdirSync(path.join(venv2, binDir), { recursive: true });

      const result = detectPythonVenv(tempDir);
      expect(result?.name).toBe('.venv');
    });

    it('should ignore VIRTUAL_ENV pointing outside target directory', () => {
      // Create a venv in a sibling directory (outside target)
      const siblingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibling-venv-'));
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      fs.mkdirSync(path.join(siblingDir, binDir), { recursive: true });

      // Set VIRTUAL_ENV to the sibling directory
      const originalVenv = process.env.VIRTUAL_ENV;
      process.env.VIRTUAL_ENV = siblingDir;

      try {
        // Should return null because VIRTUAL_ENV is outside tempDir
        const result = detectPythonVenv(tempDir);
        expect(result).toBe(null);
      } finally {
        // Restore original VIRTUAL_ENV
        if (originalVenv === undefined) {
          delete process.env.VIRTUAL_ENV;
        } else {
          process.env.VIRTUAL_ENV = originalVenv;
        }
        fs.removeSync(siblingDir);
      }
    });
  });

  describe('detectConflictingFiles', () => {
    it('should return empty array for empty directory', () => {
      const result = detectConflictingFiles(tempDir);
      expect(result).toEqual([]);
    });

    it('should detect agentmark.json', () => {
      fs.writeFileSync(path.join(tempDir, 'agentmark.json'), '{}');
      const result = detectConflictingFiles(tempDir);
      expect(result.some((f) => f.path === 'agentmark.json')).toBe(true);
    });

    it('should detect agentmark directory', () => {
      fs.mkdirSync(path.join(tempDir, 'agentmark'));
      const result = detectConflictingFiles(tempDir);
      expect(result.some((f) => f.path === 'agentmark')).toBe(true);
    });

    it('should detect .gitignore', () => {
      fs.writeFileSync(path.join(tempDir, '.gitignore'), '');
      const result = detectConflictingFiles(tempDir);
      expect(result.some((f) => f.path === '.gitignore')).toBe(true);
    });

    it('should detect package.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const result = detectConflictingFiles(tempDir);
      expect(result.some((f) => f.path === 'package.json')).toBe(true);
    });

    it('should return correct strategies for detected files', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(tempDir, '.gitignore'), '');
      fs.writeFileSync(path.join(tempDir, 'agentmark.json'), '{}');

      const result = detectConflictingFiles(tempDir);

      const packageJson = result.find((f) => f.path === 'package.json');
      expect(packageJson?.strategy).toBe('merge');

      const gitignore = result.find((f) => f.path === '.gitignore');
      expect(gitignore?.strategy).toBe('append');

      const agentmarkJson = result.find((f) => f.path === 'agentmark.json');
      expect(agentmarkJson?.strategy).toBe('prompt');
    });
  });

  describe('detectProjectInfo', () => {
    it('should detect no project in empty directory', () => {
      const result = detectProjectInfo(tempDir);
      expect(result.isExistingProject).toBe(false);
      expect(result.type).toBe('unknown');
    });

    it('should detect TypeScript project', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const result = detectProjectInfo(tempDir);
      expect(result.isExistingProject).toBe(true);
      expect(result.type).toBe('typescript');
    });

    it('should detect Python project', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '');
      const result = detectProjectInfo(tempDir);
      expect(result.isExistingProject).toBe(true);
      expect(result.type).toBe('python');
    });

    it('should include package manager info', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      const result = detectProjectInfo(tempDir);
      expect(result.packageManager.name).toBe('yarn');
    });

    it('should detect agentmark directory', () => {
      fs.mkdirSync(path.join(tempDir, 'agentmark'));
      const result = detectProjectInfo(tempDir);
      expect(result.hasAgentmarkDir).toBe(true);
    });
  });

  describe('isCurrentDirectory', () => {
    it('should return true for "."', () => {
      expect(isCurrentDirectory('.')).toBe(true);
    });

    it('should return true for "./"', () => {
      expect(isCurrentDirectory('./')).toBe(true);
    });

    it('should return true for ".\\" (Windows)', () => {
      expect(isCurrentDirectory('.\\')).toBe(true);
    });

    it('should return false for regular folder names', () => {
      expect(isCurrentDirectory('my-app')).toBe(false);
      expect(isCurrentDirectory('./my-app')).toBe(false);
    });
  });
});
