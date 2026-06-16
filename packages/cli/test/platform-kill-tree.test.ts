import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process so the kill walk never spawns real processes. `vi.hoisted`
// makes the mock fn available to the hoisted vi.mock factory below.
const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }));
vi.mock('child_process', () => ({ spawnSync: spawnSyncMock }));

import { killProcessTree, IS_WINDOWS } from '../cli-src/utils/platform';

describe('killProcessTree', () => {
  beforeEach(() => spawnSyncMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('kills the entire descendant tree (grandchildren too), leaf-first — not just direct children', () => {
    // Tree: 100 (dev) -> 200 (tsx --watch) -> 300 (dev-entry worker, owns the port).
    // The bug this guards: a non-recursive `pkill -P 100` reaches only 200 and
    // orphans 300, leaking the webhook port. `pgrep -P <pid>` returns children.
    const childrenOf: Record<number, string> = { 100: '200\n', 200: '300\n', 300: '' };
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'pgrep') {
        const pid = Number(args[args.length - 1]);
        return { stdout: childrenOf[pid] ?? '', status: 0 };
      }
      return { stdout: '', status: 0 }; // taskkill (Windows path)
    });

    const killed: number[] = [];
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(((pid: number) => {
        killed.push(Number(pid));
        return true;
      }) as typeof process.kill);

    killProcessTree(100);

    if (IS_WINDOWS) {
      // Windows delegates the whole tree to taskkill /T.
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'taskkill',
        ['/F', '/T', '/PID', '100'],
        expect.anything(),
      );
      expect(killed).toEqual([]);
    } else {
      // Unix must recurse to the grandchild, killing leaves before parents.
      expect(killed).toEqual([300, 200, 100]);
    }

    killSpy.mockRestore();
  });

  it('still kills a childless process', () => {
    spawnSyncMock.mockReturnValue({ stdout: '', status: 0 });
    const killed: number[] = [];
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(((pid: number) => {
        killed.push(Number(pid));
        return true;
      }) as typeof process.kill);

    killProcessTree(424242);

    if (IS_WINDOWS) {
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'taskkill',
        ['/F', '/T', '/PID', '424242'],
        expect.anything(),
      );
    } else {
      expect(killed).toEqual([424242]);
    }
    killSpy.mockRestore();
  });
});
