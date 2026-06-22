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

export type ParseResult =
  | { ok: true; data: AbrLookupResult }
  | { ok: false; reason: 'NO_RECORD' | 'MALFORMED' | 'CONFIG_ERROR' };

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
  if (typeof r.Message === 'string' && r.Message.toLowerCase().includes('does not exist')) {
    return { ok: false, reason: 'NO_RECORD' };
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
