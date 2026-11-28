import { describe, expect, it } from 'vitest';
import { computeFlag } from './lab-flags';

const hb = { resultType: 'NUMERIC' as const, refLow: 12, refHigh: 17 };
const mal = { resultType: 'TEXT' as const, abnormalOptions: ['Positive'] };

describe('computeFlag', () => {
  it('flags low, high and normal numeric values', () => {
    expect(computeFlag(hb, 9)).toBe('LOW');
    expect(computeFlag(hb, 18)).toBe('HIGH');
    expect(computeFlag(hb, 14)).toBe('NORMAL');
    expect(computeFlag(hb, 12)).toBe('NORMAL');
  });
  it('treats critical as overriding', () => expect(computeFlag(hb, 14, true)).toBe('CRITICAL'));
  it('flags text results against abnormal options', () => {
    expect(computeFlag(mal, 'positive')).toBe('ABNORMAL');
    expect(computeFlag(mal, 'Negative')).toBe('NORMAL');
  });
  it('returns undefined for blank, invalid or unrangeable input', () => {
    expect(computeFlag(hb, '')).toBeUndefined();
    expect(computeFlag(hb, 'abc')).toBeUndefined();
    expect(computeFlag({ resultType: 'TEXT' }, 'trace protein')).toBeUndefined();
  });
});
