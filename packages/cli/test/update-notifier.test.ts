import { describe, it, expect, vi } from 'vitest';
import { isNewerVersion } from '../cli-src/update-notifier/checker';
import { displayUpdateNotification } from '../cli-src/update-notifier/display';
import { UpdateCheckResult } from '../cli-src/update-notifier/types';

describe('update-notifier', () => {
  describe('isNewerVersion', () => {
    it('detects newer major/minor/patch versions', () => {
      expect(isNewerVersion('0.2.0', '1.0.0')).toBe(true);  // major
      expect(isNewerVersion('0.2.0', '0.3.0')).toBe(true);  // minor
      expect(isNewerVersion('0.2.0', '0.2.1')).toBe(true);  // patch
    });

    it('returns false when current is equal or newer', () => {
      expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false); // equal
      expect(isNewerVersion('0.3.0', '0.2.0')).toBe(false); // current newer
    });

    it('rejects pre-release versions', () => {
      expect(isNewerVersion('0.2.0', '0.3.0-beta.1')).toBe(false);
      expect(isNewerVersion('0.2.0', '0.3.0-alpha')).toBe(false);
    });

    it('handles invalid/malformed versions gracefully', () => {
      expect(isNewerVersion('invalid', '0.3.0')).toBe(false);
      expect(isNewerVersion('0.2.0', 'invalid')).toBe(false);
      expect(isNewerVersion('', '')).toBe(false);
      expect(isNewerVersion('1', '1.1')).toBe(true);  // missing parts
    });
  });

  describe('displayUpdateNotification', () => {
    it('displays version info when update is available', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const result: UpdateCheckResult = {
        status: 'update-available',
        info: {
          currentVersion: '0.2.0',
          latestVersion: '0.3.0',
          updateAvailable: true,
        },
      };

      displayUpdateNotification(result);

      const output = stderrSpy.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('0.2.0');
      expect(output).toContain('0.3.0');

      stderrSpy.mockRestore();
    });
  });
});
