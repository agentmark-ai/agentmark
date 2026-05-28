import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  detectTypeScriptProject,
  detectPythonProject,
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
    it('returns false for an empty directory', () => {
      expect(detectTypeScriptProject(tempDir)).toBe(false);
    });

    it('returns true when package.json exists', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      expect(detectTypeScriptProject(tempDir)).toBe(true);
    });

    it('returns true when tsconfig.json exists', () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      expect(detectTypeScriptProject(tempDir)).toBe(true);
    });

    it('returns true when node_modules exists', () => {
      fs.mkdirSync(path.join(tempDir, 'node_modules'));
      expect(detectTypeScriptProject(tempDir)).toBe(true);
    });
  });

  describe('detectPythonProject', () => {
    it('returns false for an empty directory', () => {
      expect(detectPythonProject(tempDir)).toBe(false);
    });

    it.each([
      ['pyproject.toml'],
      ['requirements.txt'],
      ['setup.py'],
    ])('returns true when %s exists', (file) => {
      fs.writeFileSync(path.join(tempDir, file), '');
      expect(detectPythonProject(tempDir)).toBe(true);
    });

    it.each([
      ['.venv'],
      ['venv'],
    ])('returns true when %s directory exists', (dir) => {
      fs.mkdirSync(path.join(tempDir, dir));
      expect(detectPythonProject(tempDir)).toBe(true);
    });
  });

  describe('detectProjectInfo', () => {
    it('returns the empty-directory shape', () => {
      expect(detectProjectInfo(tempDir)).toEqual({
        isExistingProject: false,
        hasAgentmarkJson: false,
        hasAgentmarkDir: false,
      });
    });

    it('flags an existing TypeScript project', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      expect(detectProjectInfo(tempDir)).toEqual({
        isExistingProject: true,
        hasAgentmarkJson: false,
        hasAgentmarkDir: false,
      });
    });

    it('flags an existing Python project', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '');
      expect(detectProjectInfo(tempDir)).toEqual({
        isExistingProject: true,
        hasAgentmarkJson: false,
        hasAgentmarkDir: false,
      });
    });

    it('reports hasAgentmarkJson independently of project type', () => {
      fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), { version: '2.0.0' });
      expect(detectProjectInfo(tempDir)).toEqual({
        isExistingProject: false,
        hasAgentmarkJson: true,
        hasAgentmarkDir: false,
      });
    });

    it('reports hasAgentmarkDir independently of agentmark.json', () => {
      fs.mkdirSync(path.join(tempDir, 'agentmark'));
      expect(detectProjectInfo(tempDir)).toEqual({
        isExistingProject: false,
        hasAgentmarkJson: false,
        hasAgentmarkDir: true,
      });
    });

    it('reports all three flags together for a fully-wired existing project', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), { version: '2.0.0' });
      fs.mkdirSync(path.join(tempDir, 'agentmark'));
      expect(detectProjectInfo(tempDir)).toEqual({
        isExistingProject: true,
        hasAgentmarkJson: true,
        hasAgentmarkDir: true,
      });
    });
  });

  describe('isCurrentDirectory', () => {
    it.each([
      ['.', true],
      ['./', true],
      ['.\\', true],
      ['my-app', false],
      ['./my-app', false],
      ['', false],
    ])('returns %s for input "%s"', (input, expected) => {
      expect(isCurrentDirectory(input as string)).toBe(expected);
    });
  });
});
