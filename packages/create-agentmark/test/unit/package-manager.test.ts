import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  detectPackageManager,
  getPackageManagerConfig,
  getRunScriptCmd,
} from '../../src/utils/package-manager.js';

describe('package-manager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-pm-test-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  describe('detectPackageManager', () => {
    it('should default to npm for empty directory', () => {
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('npm');
      expect(result.installCmd).toBe('npm install');
    });

    it('should detect yarn', () => {
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('yarn');
      expect(result.installCmd).toBe('yarn install');
      expect(result.addCmd).toBe('yarn add');
      expect(result.addDevCmd).toBe('yarn add --dev');
    });

    it('should detect pnpm', () => {
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('pnpm');
      expect(result.installCmd).toBe('pnpm install');
      expect(result.addCmd).toBe('pnpm add');
      expect(result.addDevCmd).toBe('pnpm add --save-dev');
    });

    it('should detect bun', () => {
      fs.writeFileSync(path.join(tempDir, 'bun.lockb'), '');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('bun');
      expect(result.installCmd).toBe('bun install');
      expect(result.addCmd).toBe('bun add');
      expect(result.addDevCmd).toBe('bun add --dev');
    });

    it('should detect npm from package-lock.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');
      const result = detectPackageManager(tempDir);
      expect(result.name).toBe('npm');
    });

    it('should follow priority order when multiple lock files exist', () => {
      // yarn has highest priority
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');
      expect(detectPackageManager(tempDir).name).toBe('yarn');

      // Clean and test pnpm priority over npm
      fs.removeSync(path.join(tempDir, 'yarn.lock'));
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');
      expect(detectPackageManager(tempDir).name).toBe('pnpm');
    });
  });

  describe('getPackageManagerConfig', () => {
    it('should return npm config for npm', () => {
      const config = getPackageManagerConfig('npm');
      expect(config.name).toBe('npm');
      expect(config.lockFile).toBe('package-lock.json');
    });

    it('should return yarn config for yarn', () => {
      const config = getPackageManagerConfig('yarn');
      expect(config.name).toBe('yarn');
      expect(config.lockFile).toBe('yarn.lock');
    });

    it('should return pnpm config for pnpm', () => {
      const config = getPackageManagerConfig('pnpm');
      expect(config.name).toBe('pnpm');
      expect(config.lockFile).toBe('pnpm-lock.yaml');
    });

    it('should return bun config for bun', () => {
      const config = getPackageManagerConfig('bun');
      expect(config.name).toBe('bun');
      expect(config.lockFile).toBe('bun.lockb');
    });
  });

  describe('getRunScriptCmd', () => {
    it('should return correct command for npm', () => {
      const config = getPackageManagerConfig('npm');
      expect(getRunScriptCmd(config, 'dev')).toBe('npm run dev');
      expect(getRunScriptCmd(config, 'build')).toBe('npm run build');
    });

    it('should return correct command for yarn', () => {
      const config = getPackageManagerConfig('yarn');
      expect(getRunScriptCmd(config, 'dev')).toBe('yarn dev');
      expect(getRunScriptCmd(config, 'build')).toBe('yarn build');
    });

    it('should return correct command for pnpm', () => {
      const config = getPackageManagerConfig('pnpm');
      expect(getRunScriptCmd(config, 'dev')).toBe('pnpm dev');
      expect(getRunScriptCmd(config, 'build')).toBe('pnpm build');
    });

    it('should return correct command for bun', () => {
      const config = getPackageManagerConfig('bun');
      expect(getRunScriptCmd(config, 'dev')).toBe('bun run dev');
      expect(getRunScriptCmd(config, 'test')).toBe('bun run test');
    });
  });
});
