import { describe, expect, it } from 'vitest';
import { isValidAbn, normaliseAbn } from '../checksum';

describe('isValidAbn', () => {
  it('accepts a known-valid ABN (ATO example: 53 004 085 616)', () => {
    expect(isValidAbn('53004085616')).toBe(true);
    expect(isValidAbn('53 004 085 616')).toBe(true);
  });

  it('rejects a checksum failure', () => {
    expect(isValidAbn('53004085617')).toBe(false);
  });

  it('accepts the ABN carried in the SWMS source documents', () => {
    // Disaster Recovery QLD. A second known-good value, independent of the
    // ATO's own example, so a broken implementation cannot pass by matching
    // one hardcoded case.
    expect(isValidAbn('42 633 062 307')).toBe(true);
  });

  it('rejects every single-digit corruption of a valid ABN', () => {
    // Exhaustive: catching one wrong digit is the checksum's whole job, and
    // two spot-checks do not demonstrate it. 11 positions x 9 alternatives.
    const valid = '53004085616';
    let checked = 0;
    for (let i = 0; i < valid.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === valid[i]) continue;
        const corrupted = valid.slice(0, i) + d + valid.slice(i + 1);
        expect(isValidAbn(corrupted), corrupted).toBe(false);
        checked++;
      }
    }
    // Positive control on the loop itself: an empty sweep must not pass.
    expect(checked).toBe(99);
  });

  it('rejects strings that are not 11 digits', () => {
    expect(isValidAbn('1234567890')).toBe(false);   // 10 digits
    expect(isValidAbn('123456789012')).toBe(false); // 12 digits
    expect(isValidAbn('5300408561A')).toBe(false);  // non-digit
    expect(isValidAbn('')).toBe(false);
    expect(isValidAbn(null as unknown as string)).toBe(false);
  });
});

describe('normaliseAbn', () => {
  it('strips whitespace and returns 11 digits', () => {
    expect(normaliseAbn('  53 004 085 616 ')).toBe('53004085616');
  });
  it('returns null when input cannot be normalised', () => {
    expect(normaliseAbn('not an abn')).toBeNull();
  });
});
