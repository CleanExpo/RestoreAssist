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

  it('returns UPSTREAM_ERROR on non-200 from ABR', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UPSTREAM_ERROR');
  });

  // Defence in depth only. ABR reports auth failures as 200 + Message, not 4xx —
  // the real bad-GUID path is covered in parse.test.ts. This guards a proxy or
  // gateway in front of ABR returning 4xx on our behalf.
  it('returns UPSTREAM_ERROR on a 4xx from in front of ABR', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UPSTREAM_ERROR');
  });

  it('rejects an invalid ABN before hitting the network', async () => {
    const spy = vi.fn();
    global.fetch = spy;
    await expect(lookupAbn('invalid')).resolves.toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns UPSTREAM_ERROR on network failure (rejected fetch)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UPSTREAM_ERROR');
  });

  it('returns UPSTREAM_ERROR when ABR returns unparseable JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);
    const result = await lookupAbn('53004085616');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UPSTREAM_ERROR');
  });

  it('still returns MALFORMED when ABR returns a well-formed 200 it cannot parse', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Abn: '', EntityName: '' }),
    } as Response);
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
