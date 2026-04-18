# Task Brief

[URGENT] M4 — Xero: Per-category account code routing (replace damage-type-only approach)

Description:

## Objective

Replace the current approach where all line items on a job share one Xero account code (the damage type) with per-category routing: Labour, Equipment, Chemicals, Subcontractors, Admin, Waste, Travel, Prelims each get their own account code.

## Current state (broken)

Both `lib/integrations/xero.ts` and `lib/integrations/xero/nir-sync.ts` map every line item to a single account code determined by damage type (200=WATER, 201=FIRE, 202=MOULD, 200=GENERAL).

## Target state

```typescript
function resolveXeroAccountCode(
  lineItem: { category: string; xeroAccountCode?: string },
  damageType: string,
  userMappings: XeroAccountCodeMapping[],
): string {
  // 1. Line item has explicit override → use it
  if (lineItem.xeroAccountCode) return lineItem.xeroAccountCode;

  // 2. User has configured a mapping for this category + damageType → use it
  const specific = userMappings.find(
    (m) => m.category === lineItem.category && m.damageType === damageType,
  );
  if (specific) return specific.accountCode;

  // 3. User has a catch-all for this category → use it
  const catchAll = userMappings.find(
    (m) => m.category === lineItem.category && !m.damageType,
  );
  if (catchAll) return catchAll.accountCode;

  // 4. Fall back to system defaults
  return DEFAULT_ACCOUNT_CODES[lineItem.category] ?? getAccountCode(damageType);
}
```

## System default account codes

```typescript
const DEFAULT_ACCOUNT_CODES: Record<string, string> = {
  Labour: process.env.XERO_ACCOUNT_LABOUR || "310",
  Equipment: process.env.XERO_ACCOUNT_EQUIPMENT || "320",
  Chemicals: process.env.XERO_ACCOUNT_CHEMICALS || "330",
  Materials: process.env.XERO_ACCOUNT_MATERIALS || "330",
  Subcontractors: process.env.XERO_ACCOUNT_SUBS || "340",
  Admin: process.env.XERO_ACCOUNT_ADMIN || "350",
  Compliance: process.env.XERO_ACCOUNT_COMPLIANCE || "350",
  Waste: process.env.XERO_ACCOUNT_WASTE || "330",
  Travel: process.env.XERO_ACCOUNT_TRAVEL || "360",
  Prelims: process.env.XERO_ACCOUNT_PRELIMS || "310",
};
```

## Files to modify

- `lib/integrations/xero.ts` — refactor `syncInvoiceToXero` line item mapping
- `lib/integrations/xero/nir-sync.ts` — refactor NIR sync line item mapping
- Add env vars to `.env.example`: XERO_ACCOUNT_LABOUR, XERO_ACCOUNT_EQUIPMENT, etc.

## Acceptance criteria

- Labour hours land in account 310 (not 200)
- Equipment hire lands in account 320 (not 200)
- Subcontractor pass-throughs land in account 340
- User can override defaults via XeroAccountCodeMapping (M1 model)
- All existing Xero sync tests still pass

Linear ticket: RA-854 — https://linear.app/unite-group/issue/RA-854/m4-xero-per-category-account-code-routing-replace-damage-type-only
Triggered automatically by Pi-CEO autonomous poller.

## Session: 731def2b0ab1
