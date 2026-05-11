import { describe, expect, it } from 'vitest';
import { parseAbrResponse } from '../parse';
import company from '../__fixtures__/company.json';
import soleTrader from '../__fixtures__/sole-trader.json';
import noRecord from '../__fixtures__/no-record.json';
import malformed from '../__fixtures__/malformed.json';

describe('parseAbrResponse', () => {
  it('parses a company response into a normalised shape', () => {
    const result = parseAbrResponse(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.legalName).toBe('BHP GROUP LIMITED');
    expect(result.data.acn).toBe('004085616');
    expect(result.data.entityType).toBe('COMPANY');
    expect(result.data.gstRegistered).toBe(true);
    expect(result.data.state).toBe('VIC');
  });

  it('parses a sole trader and exposes no ACN', () => {
    const result = parseAbrResponse(soleTrader);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entityType).toBe('SOLE_TRADER');
    expect(result.data.acn).toBeNull();
  });

  it('returns no-record on ABR Message text', () => {
    const result = parseAbrResponse(noRecord);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_RECORD');
  });

  it('returns malformed on missing required keys', () => {
    const result = parseAbrResponse(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('MALFORMED');
  });
});
