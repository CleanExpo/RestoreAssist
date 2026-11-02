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
    // Non-2xx is ABR erroring or rejecting our GUID — never a comment on the ABN.
    if (!res.ok) return { ok: false, reason: 'UPSTREAM_ERROR' };
    return parseAbrResponse(parseAbrBody(await res.text()));
  } catch {
    // Timeout, DNS, or a body that would not parse as JSON. Ours, not the caller's.
    return { ok: false, reason: 'UPSTREAM_ERROR' };
  }
}

// ABR answers JSONP as text/javascript, callback({...}), whatever Accept says, so
// res.json() threw on every reply. Parsed, never evaluated.
function parseAbrBody(body: string): unknown {
  const wrapped = body.trim().match(/^callback\(([\s\S]*)\);?$/);
  return JSON.parse(wrapped ? wrapped[1] : body);
}
