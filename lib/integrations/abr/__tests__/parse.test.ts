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
    expect(result.data.gstEffectiveFrom).toBeNull();
  });

  it('returns no-record on ABR Message text', () => {
    const result = parseAbrResponse(noRecord);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_RECORD');
  });

  // ABR signals errors as HTTP 200 + a Message body, not status codes. A GUID
  // complaint must read as our misconfiguration, never as the caller's bad ABN.
  it('returns CONFIG_ERROR when ABR complains about the GUID', () => {
    const result = parseAbrResponse({
      Abn: '',
      Message:
        'The GUID entered is not recognised as a Registered Party. Please ensure you have entered the GUID correctly.',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CONFIG_ERROR');
  });

  // A GUID complaint that also contains "does not exist" must not be read as
  // "this ABN has no record" — the GUID check has to win.
  it('returns CONFIG_ERROR when a GUID complaint also says "does not exist"', () => {
    const result = parseAbrResponse({ Abn: '', Message: 'The GUID entered does not exist' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CONFIG_ERROR');
  });

  it('returns UPSTREAM_ERROR on an unrecognised ABR Message', () => {
    const result = parseAbrResponse({
      Abn: '',
      Message: 'The ABR service is currently unavailable for scheduled maintenance.',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UPSTREAM_ERROR');
  });

  it('returns malformed on missing required keys', () => {
    const result = parseAbrResponse(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('MALFORMED');
  });
});
