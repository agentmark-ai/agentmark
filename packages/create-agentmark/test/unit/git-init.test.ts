import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { initGitRepo } from '../../src/utils/git-init.js';

// Helper: create a git commit that works on CI (no global user config)
function gitCommit(cwd: string, message: string, allowEmpty = false) {
  const empty = allowEmpty ? '--allow-empty ' : '';
  execSync(
    `git -c user.name="test" -c user.email="test@test" commit ${empty}-m "${message}"`,
    { cwd, stdio: 'ignore' },
  );
}

describe('initGitRepo', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-git-init-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('should initialize a git repo and create an initial commit', { timeout: 15000 }, () => {
    // Create some files so the commit isn't empty
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test');
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n');

    const result = initGitRepo(tempDir);

    expect(result).toBe(true);

    // Verify .git directory exists
    expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(true);

    // Verify there's exactly one commit
    const log = execSync('git log --oneline', { cwd: tempDir, encoding: 'utf-8' });
    expect(log.trim().split('\n')).toHaveLength(1);
    expect(log).toContain('Initial commit from create-agentmark');

    // Verify files are committed
    const status = execSync('git status --porcelain', { cwd: tempDir, encoding: 'utf-8' });
    expect(status.trim()).toBe('');
  });

  it('should skip when already inside a git repo', () => {
    // Initialize a git repo first
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    gitCommit(tempDir, 'existing', true);

    const result = initGitRepo(tempDir);

    expect(result).toBe(false);

    // Verify the existing commit is still there, no new commit
    const log = execSync('git log --oneline', { cwd: tempDir, encoding: 'utf-8' });
    expect(log.trim().split('\n')).toHaveLength(1);
    expect(log).toContain('existing');
  });

  it('should skip for a subdirectory inside an existing git repo', () => {
    // Initialize git at parent
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    gitCommit(tempDir, 'parent', true);

    // Create a subdirectory
    const subDir = path.join(tempDir, 'my-project');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'index.ts'), 'console.log("hello")');

    const result = initGitRepo(subDir);

    expect(result).toBe(false);

    // No nested .git
    expect(fs.existsSync(path.join(subDir, '.git'))).toBe(false);
  });

  it('should respect .gitignore in the initial commit', { timeout: 15000 }, () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n.env\n');
    fs.mkdirSync(path.join(tempDir, 'node_modules'));
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep.js'), '// dep');
    fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET=value');
    fs.writeFileSync(path.join(tempDir, 'index.ts'), 'console.log("hello")');

    const result = initGitRepo(tempDir);
    expect(result).toBe(true);

    // Verify ignored files are NOT tracked
    const tracked = execSync('git ls-files', { cwd: tempDir, encoding: 'utf-8' });
    expect(tracked).toContain('index.ts');
    expect(tracked).toContain('.gitignore');
    expect(tracked).not.toContain('.env');
    expect(tracked).not.toContain('node_modules');
  });
});
