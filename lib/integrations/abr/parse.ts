export type AbrEntityType = 'SOLE_TRADER' | 'COMPANY' | 'PARTNERSHIP' | 'TRUST' | 'OTHER';

export interface AbrLookupResult {
  abn: string;
  status: 'ACTIVE' | 'CANCELLED';
  legalName: string;
  tradingNames: string[];
  acn: string | null;
  entityType: AbrEntityType;
  gstRegistered: boolean;
  gstEffectiveFrom: string | null;
  state: string | null;
  postcode: string | null;
  asAt: string;
}

// MALFORMED      — bad ABN, or a 200 from ABR we cannot parse. Caller's input is at fault.
// NO_RECORD      — valid ABN, ABR holds no matching entity. Caller's input is at fault.
// CONFIG_ERROR   — ABR_API_GUID unset. Our fault, detected before any network call.
// UPSTREAM_ERROR — ABR unreachable, errored, rejected our GUID, or sent junk. Our fault.
export type ParseResult =
  | { ok: true; data: AbrLookupResult }
  | { ok: false; reason: 'NO_RECORD' | 'MALFORMED' | 'CONFIG_ERROR' | 'UPSTREAM_ERROR' };

const ENTITY_TYPE_MAP: Record<string, AbrEntityType> = {
  IND: 'SOLE_TRADER',
  PUB: 'COMPANY',
  PRV: 'COMPANY',
  PTR: 'PARTNERSHIP',
  DTT: 'TRUST',
  OIE: 'TRUST',
};

export function parseAbrResponse(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'MALFORMED' };
  const r = raw as Record<string, unknown>;
  // ABR reports failures as HTTP 200 with a Message body rather than a status code,
  // so Message is the only place an auth/service fault ever shows up.
  if (typeof r.Message === 'string' && r.Message.trim() !== '') {
    const msg = r.Message.toLowerCase();
    // GUID first: ABR phrases some credential errors as "The GUID entered does not
    // exist", which would otherwise be read as "this ABN has no record".
    if (msg.includes('guid')) return { ok: false, reason: 'CONFIG_ERROR' };
    if (msg.includes('does not exist')) return { ok: false, reason: 'NO_RECORD' };
    // Some other ABR-side complaint. We do not know it, but ABR is telling us the
    // request failed for a reason that is not "no such ABN" — so it is not the
    // caller's fault. Never fall through to MALFORMED here.
    return { ok: false, reason: 'UPSTREAM_ERROR' };
  }
  const abn = typeof r.Abn === 'string' ? r.Abn : null;
  const legalName = typeof r.EntityName === 'string' ? r.EntityName : null;
  const entityCode = typeof r.EntityTypeCode === 'string' ? r.EntityTypeCode : null;
  if (!abn || !legalName || !entityCode) return { ok: false, reason: 'MALFORMED' };

  const tradingNames = Array.isArray(r.BusinessName)
    ? (r.BusinessName as unknown[]).filter((n): n is string => typeof n === 'string')
    : [];

  return {
    ok: true,
    data: {
      abn,
      status: r.AbnStatus === 'Active' ? 'ACTIVE' : 'CANCELLED',
      legalName,
      tradingNames,
      acn: typeof r.Acn === 'string' && r.Acn.length > 0 ? r.Acn : null,
      entityType: ENTITY_TYPE_MAP[entityCode] ?? 'OTHER',
      gstRegistered: typeof r.Gst === 'string' && r.Gst.length > 0,
      gstEffectiveFrom: typeof r.Gst === 'string' && r.Gst.length > 0 ? r.Gst : null,
      state: typeof r.AddressState === 'string' ? r.AddressState : null,
      postcode: typeof r.AddressPostcode === 'string' ? r.AddressPostcode : null,
      asAt: typeof r.AddressDate === 'string' ? r.AddressDate : new Date().toISOString(),
    },
  };
}
