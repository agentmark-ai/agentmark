import { describe, it, expect } from 'vitest';
import { isOk, type CheckResult } from '../cli-src/commands/doctor';

let n = 0;
const r = (status: CheckResult['status'], advisory = false): CheckResult => ({
  id: `c${n++}`,
  group: 'g',
  title: 't',
  status,
  ...(advisory ? { advisory: true } : {}),
});

describe('isOk (doctor pass/fail, strict + advisory aware)', () => {
  it('fails whenever a check failed, regardless of strict', () => {
    expect(isOk([r('pass'), r('fail')])).toBe(false);
    expect(isOk([r('fail'), r('warn')], true)).toBe(false);
  });

  it('passes with warnings only when NOT strict', () => {
    expect(isOk([r('warn'), r('warn'), r('pass')])).toBe(true);
    expect(isOk([r('warn'), r('pass')], false)).toBe(true);
  });

  it('fails with a non-advisory warning under --strict (so JSON ok matches exit 1)', () => {
    expect(isOk([r('warn'), r('pass')], true)).toBe(false);
  });

  it('still passes under --strict when the only warnings are advisory', () => {
    expect(isOk([r('warn', true), r('pass')], true)).toBe(true);
    // a non-advisory warn alongside an advisory one still fails strict
    expect(isOk([r('warn', true), r('warn'), r('pass')], true)).toBe(false);
  });

  it('passes a clean report under strict and non-strict', () => {
    expect(isOk([r('pass'), r('pass')])).toBe(true);
    expect(isOk([r('pass'), r('skip')], true)).toBe(true);
  });
});
