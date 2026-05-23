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
