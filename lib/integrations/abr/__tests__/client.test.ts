import { describe, expect, it, vi, beforeEach } from 'vitest';
import { lookupAbn } from '../client';
import company from '../__fixtures__/company.json';

describe('lookupAbn', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ABR_API_GUID = 'test-guid';
    process.env.ABR_BASE_URL = 'https://abr.business.gov.au/json/';
  });

  it('returns parsed data when ABR responds 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => company,
    } as Response);

    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(true);
  });

  it('returns MALFORMED on non-200 from ABR', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('MALFORMED');
  });

  it('rejects an invalid ABN before hitting the network', async () => {
    const spy = vi.fn();
    global.fetch = spy;
    await expect(lookupAbn('invalid')).resolves.toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns MALFORMED on network failure (rejected fetch)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('MALFORMED');
  });

  it('returns CONFIG_ERROR when ABR_API_GUID is missing', async () => {
    delete process.env.ABR_API_GUID;
    const spy = vi.fn();
    global.fetch = spy;
    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CONFIG_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });
});
