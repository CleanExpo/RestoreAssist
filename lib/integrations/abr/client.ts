import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';
import { parseAbrResponse, type ParseResult } from './parse';

export async function lookupAbn(input: string): Promise<ParseResult> {
  const abn = normaliseAbn(input);
  if (!abn || !isValidAbn(abn)) return { ok: false, reason: 'MALFORMED' };

  const guid = process.env.ABR_API_GUID;
  const base = process.env.ABR_BASE_URL || 'https://abr.business.gov.au/json/';
  if (!guid) return { ok: false, reason: 'CONFIG_ERROR' };

  const url = `${base}AbnDetails.aspx?abn=${abn}&guid=${guid}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: 'MALFORMED' };
    const json = await res.json();
    return parseAbrResponse(json);
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
}
