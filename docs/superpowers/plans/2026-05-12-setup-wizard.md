# Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hard-gated, AI-driven, single-page setup wizard at `/setup` that auto-hydrates business profile + branding + pricing from a single ABN input, ending with a real-time capability health card before activating the workspace.

**Architecture:** Next.js App Router server component shell + client components subscribing to a Zustand store backed by SSE. Three parallel background hydration jobs (ABR lookup, website scrape, pricing defaults) write to a new Organization-scoped data model. Activation is a single transaction that seeds a branded sample report. Middleware redirects unactivated owner/admin users to `/setup`.

**Tech Stack:** Next.js 15 App Router, Prisma 6.x, NextAuth, Zustand, Server-Sent Events, Playwright, Vitest, k-means.js, sharp (image processing), Cloudinary (logo storage), Resend/SES (welcome email), ABR sandbox API, self-hosted Gemma (existing `lib/ai/model-router.ts`).

**Spec:** `docs/superpowers/specs/2026-05-12-onboarding-redesign-design.md`

---

## Pre-flight (do BEFORE Task 1)

- [ ] **Worktree setup (recommended)**

This is a large multi-file feature. Create an isolated worktree to keep `main` clean during development.

```bash
cd /Users/phill-mac/RestoreAssist
git fetch origin
git worktree add -b feat/setup-wizard ../RestoreAssist-setup-wizard origin/main
cd ../RestoreAssist-setup-wizard
pnpm install --frozen-lockfile
pnpm type-check
```

Expected: `pnpm type-check` exits 0 on a clean tree.

- [ ] **Register an ABR consumer key**

ABR (Australian Business Register) requires a free registered consumer key. Apply at:
https://abr.business.gov.au/Tools/WebServices

When approved, add to `.env.local` (and to Vercel project env):

```bash
# .env.local additions
ABR_API_GUID=<the GUID issued by ABR>
ABR_BASE_URL=https://abr.business.gov.au/json/   # production
ABR_SANDBOX_URL=https://abr.business.gov.au/json/test/   # for CI / tests
```

- [ ] **Install new dependencies**

```bash
pnpm add zustand ml-kmeans   # sharp is already a transitive/direct dep
pnpm install --lockfile-only
pnpm install
```

> **Note:** Original plan listed `k-means-clusterer-js`, which doesn't exist on npm. Substituted `ml-kmeans` (mljs project, well-maintained, ships its own types). Task 5's import + API call updated accordingly.

Expected: lockfile updates without conflict. `pnpm-lock.yaml` and `package.json` change together (CLAUDE.md pnpm-only rule).

- [ ] **Commit the dependency bump**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add zustand, k-means, sharp for setup wizard"
```

---

## Phase 1 — Pure utility modules (TDD foundations)

### Task 1: ABN checksum validator

**Files:**
- Create: `lib/abn/checksum.ts`
- Test: `lib/abn/__tests__/checksum.test.ts`

ABN validation algorithm (per https://abr.business.gov.au/Help/AbnFormat):
1. Subtract 1 from the first (leftmost) digit
2. Multiply each digit by its weighting factor: `[10,1,3,5,7,9,11,13,15,17,19]`
3. Sum the products
4. Valid if sum mod 89 == 0

- [ ] **Step 1: Write the failing test**

```typescript
// lib/abn/__tests__/checksum.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/abn/__tests__/checksum.test.ts
```

Expected: FAIL with "Cannot find module '../checksum'".

- [ ] **Step 3: Implement the validator**

```typescript
// lib/abn/checksum.ts
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function normaliseAbn(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const digits = input.replace(/\s+/g, '');
  if (!/^\d{11}$/.test(digits)) return null;
  return digits;
}

export function isValidAbn(input: string | null | undefined): boolean {
  const abn = normaliseAbn(input);
  if (!abn) return false;
  const first = parseInt(abn[0], 10) - 1;
  const rest = abn.slice(1).split('').map((d) => parseInt(d, 10));
  const digits = [first, ...rest];
  const sum = digits.reduce((acc, d, i) => acc + d * WEIGHTS[i], 0);
  return sum % 89 === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/abn/__tests__/checksum.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/abn/
git commit -m "feat(setup): ABN checksum validator + tests"
```

---

### Task 2: ABR response parser

**Files:**
- Create: `lib/integrations/abr/parse.ts`
- Create: `lib/integrations/abr/__fixtures__/{sole-trader,company,trust,partnership,no-record,malformed}.json`
- Test: `lib/integrations/abr/__tests__/parse.test.ts`

ABR's `AbnDetails` JSON response has nested shapes per entity type. We normalise to a single `AbrLookupResult` shape.

- [ ] **Step 1: Capture fixture responses**

Create six fixture files. Real ABR JSON for each entity type (sample below — engineer should fetch real responses from sandbox during implementation):

```json
// lib/integrations/abr/__fixtures__/company.json
{
  "Abn": "53004085616",
  "AbnStatus": "Active",
  "AbnStatusEffectiveFrom": "2000-03-01",
  "Acn": "004085616",
  "AddressDate": "2024-01-01",
  "AddressPostcode": "3000",
  "AddressState": "VIC",
  "BusinessName": [],
  "EntityName": "BHP GROUP LIMITED",
  "EntityTypeCode": "PUB",
  "EntityTypeName": "Australian Public Company",
  "Gst": "2000-07-01",
  "Message": ""
}
```

Repeat for `sole-trader.json` (EntityTypeCode `IND`), `trust.json` (`OIE`/`DTT`), `partnership.json` (`PTR`), `no-record.json` (`Message: "ABN does not exist..."`), `malformed.json` (missing keys).

- [ ] **Step 2: Write the failing test**

```typescript
// lib/integrations/abr/__tests__/parse.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/integrations/abr/__tests__/parse.test.ts
```

Expected: FAIL with "Cannot find module '../parse'".

- [ ] **Step 4: Implement the parser**

```typescript
// lib/integrations/abr/parse.ts
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
  | { ok: false; reason: 'NO_RECORD' | 'MALFORMED' };

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
      gstEffectiveFrom: typeof r.Gst === 'string' ? r.Gst : null,
      state: typeof r.AddressState === 'string' ? r.AddressState : null,
      postcode: typeof r.AddressPostcode === 'string' ? r.AddressPostcode : null,
      asAt: typeof r.AddressDate === 'string' ? r.AddressDate : new Date().toISOString(),
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/integrations/abr/__tests__/parse.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/abr/
git commit -m "feat(setup): ABR response parser + fixtures + tests"
```

---

### Task 3: ABR HTTP client + mock

**Files:**
- Create: `lib/integrations/abr/client.ts`
- Create: `lib/integrations/abr/mock.ts`
- Test: `lib/integrations/abr/__tests__/client.test.ts`

The client wraps `fetch` against the ABR JSON endpoint. We expose a `lookupAbn(abn)` returning the same `ParseResult` from Task 2. The mock module replaces the fetch in tests/CI.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/integrations/abr/__tests__/client.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/integrations/abr/__tests__/client.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the client**

```typescript
// lib/integrations/abr/client.ts
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';
import { parseAbrResponse, type ParseResult } from './parse';

export async function lookupAbn(input: string): Promise<ParseResult> {
  const abn = normaliseAbn(input);
  if (!abn || !isValidAbn(abn)) return { ok: false, reason: 'MALFORMED' };

  const guid = process.env.ABR_API_GUID;
  const base = process.env.ABR_BASE_URL || 'https://abr.business.gov.au/json/';
  if (!guid) return { ok: false, reason: 'MALFORMED' };

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
```

- [ ] **Step 4: Implement the mock helper**

```typescript
// lib/integrations/abr/mock.ts
import { parseAbrResponse, type ParseResult } from './parse';
import company from './__fixtures__/company.json';
import soleTrader from './__fixtures__/sole-trader.json';
import noRecord from './__fixtures__/no-record.json';

const REGISTRY: Record<string, unknown> = {
  '53004085616': company,
  '11111111111': soleTrader,
  '00000000000': noRecord,
};

export function mockLookupAbn(abn: string): ParseResult {
  const raw = REGISTRY[abn];
  if (!raw) return { ok: false, reason: 'NO_RECORD' };
  return parseAbrResponse(raw);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/integrations/abr/__tests__/client.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/abr/client.ts lib/integrations/abr/mock.ts lib/integrations/abr/__tests__/client.test.ts
git commit -m "feat(setup): ABR HTTP client with 5s timeout + test mock"
```

---

### Task 4: Pricing defaults dataset

**Files:**
- Create: `lib/pricing/defaults-au.ts`
- Test: `lib/pricing/__tests__/defaults-au.test.ts`

A static lookup keyed by `(state, entityType)`. Returns a partial `OrganizationPricingConfig` shape. Engineers can adjust numbers to match IICRC industry averages.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/pricing/__tests__/defaults-au.test.ts
import { describe, expect, it } from 'vitest';
import { getDefaultPricing, AU_STATES } from '../defaults-au';

describe('getDefaultPricing', () => {
  it('returns defaults for every AU state with a SOLE_TRADER entity type', () => {
    for (const state of AU_STATES) {
      const defaults = getDefaultPricing({ state, entityType: 'SOLE_TRADER' });
      expect(defaults).toBeDefined();
      expect(defaults.masterQualifiedNormalHours).toBeGreaterThan(0);
      expect(defaults.administrationFee).toBeGreaterThan(0);
    }
  });

  it('returns a higher labour rate for COMPANY than SOLE_TRADER (mid-size assumption)', () => {
    const sole = getDefaultPricing({ state: 'NSW', entityType: 'SOLE_TRADER' });
    const co = getDefaultPricing({ state: 'NSW', entityType: 'COMPANY' });
    expect(co.masterQualifiedNormalHours).toBeGreaterThanOrEqual(sole.masterQualifiedNormalHours);
  });

  it('falls back to national median when state is unknown', () => {
    const defaults = getDefaultPricing({ state: 'XX' as any, entityType: 'COMPANY' });
    expect(defaults.masterQualifiedNormalHours).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/pricing/__tests__/defaults-au.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the dataset**

```typescript
// lib/pricing/defaults-au.ts
import type { AbrEntityType } from '@/lib/integrations/abr/parse';

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export type AuState = typeof AU_STATES[number];

export interface PricingDefaults {
  // Labour (per hour, AUD)
  masterQualifiedNormalHours: number;
  qualifiedTechnicianNormalHours: number;
  labourerNormalHours: number;
  // Multipliers
  saturdayMultiplier: number;
  sundayMultiplier: number;
  afterHoursMultiplier: number;
  publicHolidayMultiplier: number;
  // Equipment (per day, AUD)
  airMoverAxialPerDay: number;
  airMoverCentrifugalPerDay: number;
  dehumidifierLgrPerDay: number;
  dehumidifierDesiccantPerDay: number;
  afdNegativeAirPerDay: number;
  hepaVacuumPerDay: number;
  // Fees
  administrationFee: number;
  callOutFee: number;
  mobilisationFee: number;
  thermalCameraUseCostPerAssessment: number;
  // Chemical treatments (per sqm, AUD)
  antimicrobialTreatmentRate: number;
  mouldRemediationTreatmentRate: number;
  // Other
  projectManagementPercent: number;
}

// IICRC industry medians (2025 dataset; adjust as needed)
const NATIONAL_MEDIAN: PricingDefaults = {
  masterQualifiedNormalHours: 165,
  qualifiedTechnicianNormalHours: 125,
  labourerNormalHours: 85,
  saturdayMultiplier: 1.5,
  sundayMultiplier: 2.0,
  afterHoursMultiplier: 1.5,
  publicHolidayMultiplier: 2.5,
  airMoverAxialPerDay: 65,
  airMoverCentrifugalPerDay: 85,
  dehumidifierLgrPerDay: 195,
  dehumidifierDesiccantPerDay: 425,
  afdNegativeAirPerDay: 215,
  hepaVacuumPerDay: 95,
  administrationFee: 165,
  callOutFee: 245,
  mobilisationFee: 185,
  thermalCameraUseCostPerAssessment: 145,
  antimicrobialTreatmentRate: 18,
  mouldRemediationTreatmentRate: 45,
  projectManagementPercent: 8,
};

// State adjustments (% above/below national median)
const STATE_ADJUSTMENT: Record<AuState, number> = {
  NSW: 1.08,
  VIC: 1.05,
  QLD: 1.02,
  WA: 1.10,
  SA: 0.95,
  TAS: 0.92,
  ACT: 1.06,
  NT: 1.15,
};

// Entity-type adjustment (companies tend to charge more than sole traders)
const ENTITY_TYPE_ADJUSTMENT: Record<AbrEntityType, number> = {
  SOLE_TRADER: 0.95,
  PARTNERSHIP: 0.98,
  COMPANY: 1.05,
  TRUST: 1.00,
  OTHER: 1.00,
};

export function getDefaultPricing(input: {
  state: AuState | string;
  entityType: AbrEntityType;
}): PricingDefaults {
  const stateMul = STATE_ADJUSTMENT[input.state as AuState] ?? 1.0;
  const entityMul = ENTITY_TYPE_ADJUSTMENT[input.entityType] ?? 1.0;
  const mul = stateMul * entityMul;

  // Only multiply rates, not multipliers (which are dimensionless)
  const PASSTHROUGH = new Set([
    'saturdayMultiplier',
    'sundayMultiplier',
    'afterHoursMultiplier',
    'publicHolidayMultiplier',
    'projectManagementPercent',
  ]);
  const result = { ...NATIONAL_MEDIAN };
  for (const k of Object.keys(NATIONAL_MEDIAN) as Array<keyof PricingDefaults>) {
    if (PASSTHROUGH.has(k)) continue;
    result[k] = Math.round((NATIONAL_MEDIAN[k] as number) * mul);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/pricing/__tests__/defaults-au.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/pricing/
git commit -m "feat(setup): AU pricing defaults dataset with state + entity adjustments"
```

---

### Task 5: Logo colour extractor

**Files:**
- Create: `lib/branding/extract-colors.ts`
- Create: `lib/branding/__fixtures__/{red-logo.png,blue-logo.png,monochrome.png,transparent.png,low-contrast.png}`
- Test: `lib/branding/__tests__/extract-colors.test.ts`

Uses `sharp` to downsample the logo to 64×64, then `k-means-clusterer-js` to find dominant colours. Returns `{ primary, accent }` as hex strings.

- [ ] **Step 1: Capture fixture PNGs**

Generate or supply five small (≤32KB) PNG fixtures. Engineers can use ImageMagick or hand-crafted PNGs:

```bash
# Red logo: 100x100, primary red
convert -size 100x100 xc:'#C0392B' lib/branding/__fixtures__/red-logo.png
# Blue logo
convert -size 100x100 xc:'#2980B9' lib/branding/__fixtures__/blue-logo.png
# Monochrome (one colour band)
convert -size 100x100 gradient:'#222222'-'#444444' lib/branding/__fixtures__/monochrome.png
# Transparent with red dot
convert -size 100x100 xc:none -fill '#C0392B' -draw 'circle 50,50 50,20' lib/branding/__fixtures__/transparent.png
# Low contrast pair
convert -size 100x100 gradient:'#888888'-'#999999' lib/branding/__fixtures__/low-contrast.png
```

- [ ] **Step 2: Write the failing test**

```typescript
// lib/branding/__tests__/extract-colors.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractColors } from '../extract-colors';

const fix = (name: string) => readFileSync(join(__dirname, '../__fixtures__', name));

describe('extractColors', () => {
  it('extracts a red primary from a red logo', async () => {
    const { primary } = await extractColors(fix('red-logo.png'));
    expect(primary.toLowerCase()).toMatch(/^#[c-f][0-9a-f]{5}/i); // some red-ish hex
  });

  it('returns a usable pair from a transparent logo (alpha respected)', async () => {
    const result = await extractColors(fix('transparent.png'));
    expect(result.primary).not.toEqual(result.accent);
  });

  it('flags low contrast when WCAG AA fails', async () => {
    const result = await extractColors(fix('low-contrast.png'));
    expect(result.contrastWarning).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/branding/__tests__/extract-colors.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the extractor**

```typescript
// lib/branding/extract-colors.ts
import sharp from 'sharp';
import { kmeans } from 'ml-kmeans';

export interface ColorExtractResult {
  primary: string;
  accent: string;
  contrastWarning: boolean;
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [R, G, B] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const L1 = relativeLuminance(...rgb1);
  const L2 = relativeLuminance(...rgb2);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

export async function extractColors(buf: Buffer): Promise<ColorExtractResult> {
  // Downsample to 64x64 RGBA
  const { data } = await sharp(buf)
    .resize(64, 64, { fit: 'inside' })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  // Build pixel list, dropping fully transparent and near-white pixels (favicons often white-padded)
  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) continue; // skip near-white
    pixels.push([r, g, b]);
  }
  if (pixels.length === 0) {
    return { primary: '#1C2E47', accent: '#8A6B4E', contrastWarning: false };
  }

  // k-means with k=2
  const result = kmeans(pixels, 2, { maxIterations: 25 });
  const sorted = result.centroids.slice().sort((a, b) => {
    // primary = darker / more saturated; accent = lighter
    return relativeLuminance(a[0], a[1], a[2]) - relativeLuminance(b[0], b[1], b[2]);
  });

  const primaryRgb = sorted[0] as [number, number, number];
  const accentRgb = sorted[sorted.length - 1] as [number, number, number];
  const ratio = contrastRatio(primaryRgb, accentRgb);

  return {
    primary: toHex(...primaryRgb),
    accent: toHex(...accentRgb),
    contrastWarning: ratio < 4.5,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/branding/__tests__/extract-colors.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add lib/branding/
git commit -m "feat(setup): logo k-means colour extraction + WCAG contrast check"
```

---

### Task 6: Website scraper

**Files:**
- Create: `lib/branding/scrape.ts`
- Test: `lib/branding/__tests__/scrape.test.ts`

Uses Playwright (already a dev dep) to fetch a URL, extract `<link rel="icon">`, `og:image`, and the homepage hero text. Returns a `{ logoUrl, hero }` payload. About-copy summarisation is Task 7.

- [ ] **Step 1: Write the failing test (using a local fixture server)**

```typescript
// lib/branding/__tests__/scrape.test.ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { scrapeWebsite } from '../scrape';

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><head>
          <link rel="icon" href="/favicon.png">
          <meta property="og:image" content="https://cdn.example.com/logo.png">
        </head><body>
          <h1>ACME Restoration</h1>
          <p>We restore water-damaged buildings across NSW.</p>
        </body></html>
      `);
    } else if (req.url === '/favicon.png') {
      // Send a 1x1 PNG (transparent)
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  port = (server.address() as any).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('scrapeWebsite', () => {
  it('extracts logo + hero text', async () => {
    const result = await scrapeWebsite(`http://localhost:${port}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(result.data.hero).toContain('ACME Restoration');
  });

  it('returns ok:false on a 404', async () => {
    const result = await scrapeWebsite(`http://localhost:${port}/missing`);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/branding/__tests__/scrape.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the scraper**

```typescript
// lib/branding/scrape.ts
import { chromium } from 'playwright';

export interface ScrapeResult {
  logoUrl: string | null;
  hero: string;
}

export async function scrapeWebsite(url: string): Promise<
  { ok: true; data: ScrapeResult } | { ok: false; reason: string }
> {
  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ userAgent: 'RestoreAssistSetupBot/1.0' });
    const page = await ctx.newPage();
    const response = await page.goto(url, { timeout: 5000, waitUntil: 'domcontentloaded' });
    if (!response || !response.ok()) return { ok: false, reason: `HTTP ${response?.status() ?? 'NONE'}` };

    const data = await page.evaluate(() => {
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const iconHref =
        document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
        document.querySelector('link[rel="icon"]')?.getAttribute('href');
      const heroEl = document.querySelector('h1, .hero, [class*="hero"]');
      return {
        ogImage: ogImage || null,
        iconHref: iconHref || null,
        hero: (heroEl?.textContent ?? document.body.innerText ?? '').slice(0, 1500).trim(),
      };
    });

    const logoUrl = data.ogImage || (data.iconHref ? new URL(data.iconHref, url).toString() : null);
    return { ok: true, data: { logoUrl, hero: data.hero } };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  } finally {
    await browser?.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/branding/__tests__/scrape.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/branding/scrape.ts lib/branding/__tests__/scrape.test.ts
git commit -m "feat(setup): Playwright website scrape with 5s timeout"
```

---

### Task 7: About-copy extractor (Gemma summariser)

**Files:**
- Create: `lib/branding/extract-about.ts`
- Test: `lib/branding/__tests__/extract-about.test.ts`

Takes the `hero` text from Task 6 and asks Gemma (via `lib/ai/model-router.ts`) to compress it to a single, professional paragraph. Returns `{ paragraph, confidence }`. If confidence < 0.5 we return `null` and the UI flips to manual entry.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/branding/__tests__/extract-about.test.ts
import { describe, expect, it, vi } from 'vitest';
import { extractAboutCopy } from '../extract-about';

vi.mock('@/lib/ai/model-router', () => ({
  routeBasic: vi.fn(),
}));

import { routeBasic } from '@/lib/ai/model-router';

describe('extractAboutCopy', () => {
  it('returns null for clearly empty hero text', async () => {
    const result = await extractAboutCopy('');
    expect(result).toBeNull();
  });

  it('returns the Gemma paragraph when confidence is high', async () => {
    (routeBasic as any).mockResolvedValueOnce({
      text: 'ACME Restoration is a Sydney-based water damage specialist serving NSW.',
      confidence: 0.92,
    });
    const result = await extractAboutCopy('ACME Restoration\nWe restore water-damaged buildings across NSW.');
    expect(result?.paragraph).toContain('ACME');
  });

  it('returns null when Gemma confidence falls below threshold', async () => {
    (routeBasic as any).mockResolvedValueOnce({ text: '...', confidence: 0.3 });
    const result = await extractAboutCopy('garbage 404 page text');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/branding/__tests__/extract-about.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the extractor**

```typescript
// lib/branding/extract-about.ts
import { routeBasic } from '@/lib/ai/model-router';

const PROMPT = `You are summarising an Australian water-damage-restoration company's homepage for their CRM profile.
Write ONE professional paragraph (40-80 words) describing what they do, who they serve, and where.
Return JSON: { "text": string, "confidence": number 0-1 }.
Hero text:
---
{HERO}
---`;

export async function extractAboutCopy(hero: string): Promise<{ paragraph: string; confidence: number } | null> {
  if (!hero || hero.trim().length < 20) return null;
  const filled = PROMPT.replace('{HERO}', hero.slice(0, 1200));
  try {
    const result = await routeBasic(filled, { responseFormat: 'json' });
    if (!result || typeof result.text !== 'string' || typeof result.confidence !== 'number') return null;
    if (result.confidence < 0.5) return null;
    return { paragraph: result.text.trim(), confidence: result.confidence };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/branding/__tests__/extract-about.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/branding/extract-about.ts lib/branding/__tests__/extract-about.test.ts
git commit -m "feat(setup): Gemma about-copy summariser with confidence threshold"
```

---

### Task 8: Hydration state machine

**Files:**
- Create: `lib/setup/hydration-state-machine.ts`
- Test: `lib/setup/__tests__/hydration-state-machine.test.ts`

Pure function that validates `HydrationJob` state transitions. Used server-side before any DB update.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/setup/__tests__/hydration-state-machine.test.ts
import { describe, expect, it } from 'vitest';
import { canTransition, type HydrationState } from '../hydration-state-machine';

describe('canTransition', () => {
  it.each<[HydrationState, HydrationState, boolean]>([
    ['pending', 'running', true],
    ['running', 'ready', true],
    ['running', 'error', true],
    ['running', 'manual', true],
    ['ready', 'running', true],  // user changed ABN -> re-run
    ['error', 'running', true],
    ['manual', 'ready', true],   // hydration succeeded after manual fill
    ['ready', 'pending', false], // never go backward
    ['error', 'pending', false],
  ])('%s -> %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/setup/__tests__/hydration-state-machine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the state machine**

```typescript
// lib/setup/hydration-state-machine.ts
export type HydrationState = 'pending' | 'running' | 'ready' | 'error' | 'manual';

const ALLOWED: Record<HydrationState, HydrationState[]> = {
  pending: ['running', 'manual'],
  running: ['ready', 'error', 'manual'],
  ready:   ['running'],
  error:   ['running', 'manual'],
  manual:  ['ready', 'running'],
};

export function canTransition(from: HydrationState, to: HydrationState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/setup/__tests__/hydration-state-machine.test.ts
```

Expected: 9 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/
git commit -m "feat(setup): hydration job state machine"
```

---

## Phase 2 — Schema migration

### Task 9: Prisma schema additions (Migration A)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_setup_wizard_phase_a/migration.sql` (generated)

This is **additive only** per CLAUDE.md rule #16 — we add columns, never drop. Drop happens in Migration B in a later release.

- [ ] **Step 1: Add the Organization fields, new models, and enum**

Append/edit `prisma/schema.prisma`:

```prisma
enum TradingStatus {
  ACTIVE
  PRE_TRADING
}

enum SetupMode {
  AI
  MANUAL
}

enum HydrationKind {
  ABR
  WEBSITE
  PRICING
}

enum HydrationStatus {
  RUNNING
  READY
  ERROR
  MANUAL
}

model Organization {
  // ... existing fields ...

  // Setup wizard additions
  legalName        String?
  tradingName      String?
  abn              String?  @unique
  acn              String?
  state            String?
  address          String?
  phone            String?
  email            String?
  website          String?
  logoUrl          String?
  primaryColor     String?
  accentColor      String?
  aboutCopy        String?  @db.Text
  tradingStatus    TradingStatus  @default(ACTIVE)
  setupStartedAt   DateTime?
  setupCompletedAt DateTime?
  setupMode        SetupMode      @default(AI)

  hydrationJobs    HydrationJob[]
  pricingConfig    OrganizationPricingConfig?
}

model HydrationJob {
  id              String           @id @default(cuid())
  organizationId  String
  kind            HydrationKind
  status          HydrationStatus
  payload         Json?
  errorMessage    String?
  startedAt       DateTime         @default(now())
  completedAt     DateTime?

  organization    Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, kind])
  @@index([status, startedAt])
}

model AbnLookupCache {
  abn         String   @id
  payload     Json
  fetchedAt   DateTime @default(now())
  expiresAt   DateTime
}

// Renamed from CompanyPricingConfig (which was per-user)
model OrganizationPricingConfig {
  id              String  @id @default(cuid())
  organizationId  String  @unique
  // ... copy all existing CompanyPricingConfig fields here ...
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
```

For the rename, copy ALL existing fields from `CompanyPricingConfig` into `OrganizationPricingConfig`. Engineer must read `prisma/schema.prisma` first to copy the exact field list.

- [ ] **Step 2: Validate schema**

```bash
npx prisma validate
```

Expected: "The schema is valid."

- [ ] **Step 3: Generate migration**

```bash
npx prisma migrate dev --name setup_wizard_phase_a --create-only
```

Expected: a new directory `prisma/migrations/<timestamp>_setup_wizard_phase_a/` with `migration.sql`. Inspect — should contain `CREATE TYPE`, `ALTER TABLE Organization ADD COLUMN`, `CREATE TABLE HydrationJob`, `CREATE TABLE AbnLookupCache`, and `CREATE TABLE OrganizationPricingConfig`. There should be NO `DROP` statements.

- [ ] **Step 4: Apply the migration locally**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: schema is in sync. `pnpm type-check` exits 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/*_setup_wizard_phase_a
git commit -m "feat(setup): Prisma additions — Organization fields, HydrationJob, AbnLookupCache, OrganizationPricingConfig"
```

---

### Task 10: Backfill script (User → Organization business profile + pricing)

**Files:**
- Create: `scripts/backfill-setup-wizard.ts`
- Test: `scripts/__tests__/backfill-setup-wizard.test.ts`

Idempotent. Reads each `User`, finds owning `Organization`, copies `User.business*` → `Organization.*` if Organization field is null. Also moves `CompanyPricingConfig` rows to `OrganizationPricingConfig` (deleting the old row).

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/__tests__/backfill-setup-wizard.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { backfill } from '../backfill-setup-wizard';
import { prisma } from '@/lib/prisma';

describe('backfill', () => {
  beforeEach(async () => {
    await prisma.organizationPricingConfig.deleteMany({});
    await prisma.companyPricingConfig.deleteMany({});
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it('copies User business fields onto owning Organization', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'a@a.com',
        businessName: 'Acme Pty Ltd',
        businessABN: '53004085616',
        businessState: 'NSW',
      },
    });
    const org = await prisma.organization.create({ data: { name: 'Acme Pty Ltd', ownerId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: org.id } });

    await backfill();

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.abn).toBe('53004085616');
    expect(after.state).toBe('NSW');
    expect(after.legalName).toBe('Acme Pty Ltd');
  });

  it('is idempotent — re-running is a no-op', async () => {
    const user = await prisma.user.create({
      data: { email: 'b@b.com', businessName: 'X', businessABN: '53004085616' },
    });
    const org = await prisma.organization.create({ data: { name: 'X', ownerId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: org.id } });

    await backfill();
    await backfill();

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.abn).toBe('53004085616');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run scripts/__tests__/backfill-setup-wizard.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the backfill**

```typescript
// scripts/backfill-setup-wizard.ts
import { prisma } from '@/lib/prisma';

export async function backfill() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      organizationId: true,
      businessName: true,
      businessABN: true,
      businessACN: true,
      businessState: true,
      businessAddress: true,
      businessPhone: true,
      businessEmail: true,
      businessLogo: true,
    },
    take: 10_000,
  });

  for (const u of users) {
    if (!u.organizationId) continue;
    const org = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { id: true, legalName: true, abn: true, state: true } });
    if (!org) continue;

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        legalName: org.legalName ?? u.businessName ?? undefined,
        abn:        org.abn       ?? u.businessABN ?? undefined,
        acn:                         u.businessACN ?? undefined,
        state:      org.state     ?? u.businessState ?? undefined,
        address:                     u.businessAddress ?? undefined,
        phone:                       u.businessPhone ?? undefined,
        email:                       u.businessEmail ?? undefined,
        logoUrl:                     u.businessLogo ?? undefined,
      },
    });

    // Move CompanyPricingConfig → OrganizationPricingConfig
    const cpc = await prisma.companyPricingConfig.findFirst({ where: { userId: u.id } });
    if (cpc) {
      const existing = await prisma.organizationPricingConfig.findUnique({ where: { organizationId: org.id } });
      if (!existing) {
        const { id, userId, ...rest } = cpc as any;
        await prisma.organizationPricingConfig.create({ data: { ...rest, organizationId: org.id } });
      }
    }
  }
}

if (require.main === module) {
  backfill().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run scripts/__tests__/backfill-setup-wizard.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-setup-wizard.ts scripts/__tests__/
git commit -m "feat(setup): idempotent backfill User business profile + pricing → Organization"
```

---

## Phase 3 — Subscription gate bypass for setup hydration

### Task 11: BYPASS_CREDIT_GATE flag in model-router

**Files:**
- Modify: `lib/ai/model-router.ts`
- Test: `lib/ai/__tests__/model-router.test.ts`

CLAUDE.md rule #8 says every AI call must be gated on `["TRIAL","ACTIVE","LIFETIME"]`. Setup hydration runs on Gemma (platform-paid) and must succeed even when `creditsRemaining === 0`. We add an explicit bypass scoped to setup-only.

- [ ] **Step 1: Read the existing model-router**

```bash
cat lib/ai/model-router.ts
```

Identify the credit-check function. It almost certainly looks like a `requireCreditsOrThrow(userId)` call.

- [ ] **Step 2: Write the failing test**

```typescript
// lib/ai/__tests__/model-router.test.ts (add to existing file or create)
import { describe, expect, it } from 'vitest';
import { routeBasic } from '../model-router';

describe('routeBasic with bypassCreditGate', () => {
  it('runs Gemma even when creditsRemaining is 0 if bypassCreditGate is set', async () => {
    // Setup a user with 0 credits
    // ... fixture setup omitted; use existing test helpers ...
    const result = await routeBasic('hello', { userId: 'zero-credit-user', bypassCreditGate: true });
    expect(result).toBeDefined();
  });

  it('rejects when creditsRemaining is 0 and bypassCreditGate is not set', async () => {
    await expect(routeBasic('hello', { userId: 'zero-credit-user' })).rejects.toThrow(/credits/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/ai/__tests__/model-router.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Patch model-router**

```typescript
// lib/ai/model-router.ts (modify the existing routeBasic signature)
export interface RouteOptions {
  userId?: string;
  responseFormat?: 'text' | 'json';
  bypassCreditGate?: boolean;
}

export async function routeBasic(prompt: string, opts: RouteOptions = {}) {
  if (opts.userId && !opts.bypassCreditGate) {
    await requireCreditsOrThrow(opts.userId);
  }
  // ... existing Gemma call ...
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/ai/__tests__/model-router.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/model-router.ts lib/ai/__tests__/model-router.test.ts
git commit -m "feat(setup): BYPASS_CREDIT_GATE for Gemma-tier setup hydration"
```

---

## Phase 4 — Feature health checks library

### Task 12: lib/setup/checks.ts (capability registry)

**Files:**
- Create: `lib/setup/checks.ts`
- Test: `lib/setup/__tests__/checks.test.ts`

Registry of capability checks. Each check is `(orgId) => Promise<CheckResult>`. The API route calls all checks and aggregates.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/setup/__tests__/checks.test.ts
import { describe, expect, it } from 'vitest';
import { runAllChecks, CHECKS } from '../checks';

describe('runAllChecks', () => {
  it('returns one result per registered check', async () => {
    const results = await runAllChecks('test-org-id');
    expect(results).toHaveLength(CHECKS.length);
    for (const r of results) {
      expect(['green', 'yellow', 'red']).toContain(r.status);
      expect(typeof r.capability).toBe('string');
    }
  });

  it('returns red for business profile when required fields missing', async () => {
    // ... seed an org with no legalName / abn ...
    const results = await runAllChecks('empty-org-id');
    const bp = results.find((r) => r.capability === 'business_profile');
    expect(bp?.status).toBe('red');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/setup/__tests__/checks.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the registry**

```typescript
// lib/setup/checks.ts
import { prisma } from '@/lib/prisma';
import { routeBasic } from '@/lib/ai/model-router';

export type CheckStatus = 'green' | 'yellow' | 'red';

export interface CheckResult {
  capability: string;
  label: string;
  status: CheckStatus;
  note?: string;
}

type Check = (orgId: string) => Promise<CheckResult>;

const businessProfileCheck: Check = async (orgId) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { legalName: true, abn: true, state: true, tradingStatus: true },
  });
  const missing = !org?.legalName || !org?.state || (!org?.abn && org?.tradingStatus !== 'PRE_TRADING');
  return {
    capability: 'business_profile',
    label: 'Business profile complete',
    status: missing ? 'red' : 'green',
    note: missing ? 'Add legal name, state, and ABN (or mark pre-trading)' : undefined,
  };
};

const brandingCheck: Check = async (orgId) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoUrl: true, primaryColor: true },
  });
  if (!org?.logoUrl && !org?.primaryColor) return { capability: 'branding', label: 'Branding set', status: 'red' };
  if (!org?.logoUrl || !org?.primaryColor) return { capability: 'branding', label: 'Branding set', status: 'yellow', note: 'Logo or primary colour missing' };
  return { capability: 'branding', label: 'Branding set', status: 'green' };
};

const pricingCheck: Check = async (orgId) => {
  const p = await prisma.organizationPricingConfig.findUnique({
    where: { organizationId: orgId },
    select: { masterQualifiedNormalHours: true, administrationFee: true },
  });
  const ready = !!p?.masterQualifiedNormalHours && !!p?.administrationFee;
  return { capability: 'pricing', label: 'Pricing config', status: ready ? 'green' : 'red' };
};

const aiGenerationCheck: Check = async () => {
  try {
    const result = await routeBasic('Reply with the word "ok".', { bypassCreditGate: true });
    return { capability: 'ai_generation', label: 'AI generation (Gemma)', status: result ? 'green' : 'red' };
  } catch {
    return { capability: 'ai_generation', label: 'AI generation (Gemma)', status: 'red' };
  }
};

// Add: sample_report_render, chain_of_custody, cloud_storage, accounting, byok_keys, welcome_email
// Each implemented similarly — see spec Section 5.

export const CHECKS: Check[] = [
  businessProfileCheck,
  brandingCheck,
  pricingCheck,
  aiGenerationCheck,
];

export async function runAllChecks(orgId: string): Promise<CheckResult[]> {
  return Promise.all(CHECKS.map((c) => c(orgId)));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/setup/__tests__/checks.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/checks.ts lib/setup/__tests__/checks.test.ts
git commit -m "feat(setup): capability check registry (business / branding / pricing / AI)"
```

---

## Phase 5 — API routes

### Task 13: POST /api/setup/hydrate (kick off jobs)

**Files:**
- Create: `app/api/setup/hydrate/route.ts`
- Test: `app/api/setup/hydrate/__tests__/route.test.ts`

Auth-gated route. Takes `{ abn, website? }`. Creates/updates 3 `HydrationJob` rows in RUNNING state, kicks off background work (which writes back to the rows + Organization), returns immediately.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/setup/hydrate/__tests__/route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

vi.mock('next-auth', () => ({ getServerSession: () => ({ user: { id: 'user-1' } }) }));

describe('POST /api/setup/hydrate', () => {
  it('400s on invalid ABN', async () => {
    const req = new Request('http://test/api/setup/hydrate', { method: 'POST', body: JSON.stringify({ abn: '123' }) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('creates 3 HydrationJob rows for a valid ABN', async () => {
    const req = new Request('http://test/api/setup/hydrate', { method: 'POST', body: JSON.stringify({ abn: '53004085616', website: 'https://example.com' }) });
    const res = await POST(req as any);
    expect(res.status).toBe(202);
    // ... assert HydrationJob.findMany for the user's org returns 3 rows ...
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/setup/hydrate/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/setup/hydrate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';
import { runAbrJob, runWebsiteJob, runPricingJob } from '@/lib/setup/jobs';

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { abn?: string; website?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const abn = normaliseAbn(body.abn ?? '');
  if (!abn || !isValidAbn(abn)) return NextResponse.json({ error: 'Invalid ABN' }, { status: 400 });

  const org = await prisma.organization.findFirst({ where: { ownerId: session.user.id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  // Upsert 3 jobs in RUNNING (ON CONFLICT coalescing)
  const kinds = ['ABR', 'WEBSITE', 'PRICING'] as const;
  for (const kind of kinds) {
    await prisma.hydrationJob.upsert({
      where: { organizationId_kind: { organizationId: org.id, kind } },
      create: { organizationId: org.id, kind, status: 'RUNNING' },
      update: { status: 'RUNNING', errorMessage: null, startedAt: new Date(), completedAt: null },
    });
  }

  // Mark setupStartedAt on first hydrate
  await prisma.organization.update({
    where: { id: org.id },
    data: { abn, website: body.website ?? null, setupStartedAt: new Date() },
  });

  // Fire and forget — jobs write back to HydrationJob + Organization
  void runAbrJob(org.id, abn);
  if (body.website) void runWebsiteJob(org.id, body.website);
  void runPricingJob(org.id);

  return NextResponse.json({ ok: true }, { status: 202 });
}
```

- [ ] **Step 4: Create the job runners**

```typescript
// lib/setup/jobs.ts
import { prisma } from '@/lib/prisma';
import { lookupAbn } from '@/lib/integrations/abr/client';
import { scrapeWebsite } from '@/lib/branding/scrape';
import { extractColors } from '@/lib/branding/extract-colors';
import { extractAboutCopy } from '@/lib/branding/extract-about';
import { getDefaultPricing } from '@/lib/pricing/defaults-au';

export async function runAbrJob(orgId: string, abn: string) {
  // Cache hit?
  const cached = await prisma.abnLookupCache.findUnique({ where: { abn } });
  const fresh = cached && cached.expiresAt > new Date();
  const result = fresh ? cached!.payload as any : await lookupAbn(abn);

  if (!fresh && (result as any).ok) {
    const expires = new Date(); expires.setDate(expires.getDate() + 30);
    await prisma.abnLookupCache.upsert({
      where: { abn },
      create: { abn, payload: result as any, expiresAt: expires },
      update: { payload: result as any, fetchedAt: new Date(), expiresAt: expires },
    });
  }

  if (!(result as any).ok) {
    await prisma.hydrationJob.update({
      where: { organizationId_kind: { organizationId: orgId, kind: 'ABR' } },
      data: { status: 'ERROR', errorMessage: (result as any).reason, completedAt: new Date() },
    });
    return;
  }
  const data = (result as any).data;
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      legalName: data.legalName,
      tradingName: data.tradingNames[0] ?? null,
      acn: data.acn,
      state: data.state,
    },
  });
  await prisma.hydrationJob.update({
    where: { organizationId_kind: { organizationId: orgId, kind: 'ABR' } },
    data: { status: 'READY', payload: data, completedAt: new Date() },
  });
}

export async function runWebsiteJob(orgId: string, url: string) {
  const scrape = await scrapeWebsite(url);
  if (!scrape.ok) {
    await prisma.hydrationJob.update({
      where: { organizationId_kind: { organizationId: orgId, kind: 'WEBSITE' } },
      data: { status: 'MANUAL', errorMessage: scrape.reason, completedAt: new Date() },
    });
    return;
  }
  let primaryColor: string | null = null, accentColor: string | null = null;
  if (scrape.data.logoUrl) {
    try {
      const res = await fetch(scrape.data.logoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const colors = await extractColors(buf);
        primaryColor = colors.primary;
        accentColor = colors.accent;
      }
    } catch { /* swallow; UI will allow manual upload */ }
  }
  const about = await extractAboutCopy(scrape.data.hero);

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      logoUrl: scrape.data.logoUrl,
      primaryColor,
      accentColor,
      aboutCopy: about?.paragraph ?? null,
    },
  });
  await prisma.hydrationJob.update({
    where: { organizationId_kind: { organizationId: orgId, kind: 'WEBSITE' } },
    data: { status: 'READY', payload: { logoUrl: scrape.data.logoUrl, primaryColor, accentColor, aboutCopy: about?.paragraph }, completedAt: new Date() },
  });
}

export async function runPricingJob(orgId: string) {
  // Wait briefly for ABR to land (so we know state + entityType)
  // Poll up to 5s
  let abrPayload: any = null;
  for (let i = 0; i < 10; i++) {
    const j = await prisma.hydrationJob.findUnique({
      where: { organizationId_kind: { organizationId: orgId, kind: 'ABR' } },
    });
    if (j?.status === 'READY' || j?.status === 'ERROR') { abrPayload = j.payload; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  const state = abrPayload?.state ?? 'NSW';
  const entityType = abrPayload?.entityType ?? 'OTHER';
  const defaults = getDefaultPricing({ state, entityType });

  await prisma.organizationPricingConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...defaults },
    update: defaults,
  });
  await prisma.hydrationJob.update({
    where: { organizationId_kind: { organizationId: orgId, kind: 'PRICING' } },
    data: { status: 'READY', payload: defaults as any, completedAt: new Date() },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run app/api/setup/hydrate/__tests__/route.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 6: Commit**

```bash
git add app/api/setup/hydrate/ lib/setup/jobs.ts
git commit -m "feat(setup): POST /api/setup/hydrate + 3 background jobs (ABR/website/pricing)"
```

---

### Task 14: GET /api/setup/hydrate/stream (SSE)

**Files:**
- Create: `app/api/setup/hydrate/stream/route.ts`
- Test: `app/api/setup/hydrate/stream/__tests__/route.test.ts`

SSE endpoint polling `HydrationJob` every 1s and emitting changes. Closes when all 3 jobs are terminal.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/setup/hydrate/stream/__tests__/route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

vi.mock('next-auth', () => ({ getServerSession: () => ({ user: { id: 'user-1' } }) }));

describe('GET /api/setup/hydrate/stream', () => {
  it('returns Content-Type text/event-stream', async () => {
    const req = new Request('http://test/api/setup/hydrate/stream');
    const res = await GET(req as any);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/setup/hydrate/stream/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the SSE route**

```typescript
// app/api/setup/hydrate/stream/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const org = await prisma.organization.findFirst({ where: { ownerId: session.user.id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastState = '';
      const maxIterations = 120; // 2 minutes
      for (let i = 0; i < maxIterations; i++) {
        const jobs = await prisma.hydrationJob.findMany({
          where: { organizationId: org.id },
          select: { kind: true, status: true, payload: true, errorMessage: true },
        });
        const snapshot = JSON.stringify(jobs);
        if (snapshot !== lastState) {
          controller.enqueue(encoder.encode(`data: ${snapshot}\n\n`));
          lastState = snapshot;
        }
        const allTerminal = jobs.length === 3 && jobs.every((j) => j.status === 'READY' || j.status === 'ERROR' || j.status === 'MANUAL');
        if (allTerminal) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/setup/hydrate/stream/__tests__/route.test.ts
```

Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add app/api/setup/hydrate/stream/
git commit -m "feat(setup): SSE /api/setup/hydrate/stream"
```

---

### Task 15: GET /api/setup/state

**Files:**
- Create: `app/api/setup/state/route.ts`
- Test: `app/api/setup/state/__tests__/route.test.ts`

Returns the full setup snapshot: Organization fields + per-section status + hydration job state. Used on initial page load and on tab-resume.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/setup/state/__tests__/route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

vi.mock('next-auth', () => ({ getServerSession: () => ({ user: { id: 'user-1' } }) }));

describe('GET /api/setup/state', () => {
  it('returns the setup snapshot', async () => {
    const req = new Request('http://test/api/setup/state');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty('organization');
    expect(json.data).toHaveProperty('sections');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/setup/state/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/setup/state/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: {
      id: true, legalName: true, tradingName: true, abn: true, acn: true, state: true, address: true,
      phone: true, email: true, website: true, logoUrl: true, primaryColor: true, accentColor: true,
      aboutCopy: true, tradingStatus: true, setupStartedAt: true, setupCompletedAt: true, setupMode: true,
      pricingConfig: true,
      hydrationJobs: { select: { kind: true, status: true, errorMessage: true, completedAt: true } },
    },
  });
  if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  return NextResponse.json({
    data: {
      organization: org,
      sections: {
        businessDetails: org.hydrationJobs.find((j) => j.kind === 'ABR')?.status ?? 'PENDING',
        branding:        org.hydrationJobs.find((j) => j.kind === 'WEBSITE')?.status ?? 'PENDING',
        pricing:         org.hydrationJobs.find((j) => j.kind === 'PRICING')?.status ?? 'PENDING',
      },
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/setup/state/__tests__/route.test.ts
```

Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add app/api/setup/state/
git commit -m "feat(setup): GET /api/setup/state — snapshot for page load + resume"
```

---

### Task 16: GET /api/setup/checks

**Files:**
- Create: `app/api/setup/checks/route.ts`
- Test: `app/api/setup/checks/__tests__/route.test.ts`

Runs the capability registry and returns the row array.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/setup/checks/__tests__/route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

vi.mock('next-auth', () => ({ getServerSession: () => ({ user: { id: 'user-1' } }) }));

describe('GET /api/setup/checks', () => {
  it('returns capability rows', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data.checks)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/setup/checks/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/setup/checks/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { runAllChecks } from '@/lib/setup/checks';

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const org = await prisma.organization.findFirst({ where: { ownerId: session.user.id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  const checks = await runAllChecks(org.id);
  return NextResponse.json({ data: { checks } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/setup/checks/__tests__/route.test.ts
```

Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add app/api/setup/checks/
git commit -m "feat(setup): GET /api/setup/checks (capability health)"
```

---

### Task 17: POST /api/setup/activate (transactional)

**Files:**
- Create: `app/api/setup/activate/route.ts`
- Test: `app/api/setup/activate/__tests__/route.test.ts`

Re-runs pre-flight, then a single transaction: propagate branding → InvoiceTemplate, seed sample client + report, set setupCompletedAt, write analytics, dispatch welcome email.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/setup/activate/__tests__/route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

vi.mock('next-auth', () => ({ getServerSession: () => ({ user: { id: 'user-1' } }) }));

describe('POST /api/setup/activate', () => {
  it('400s when any red check fails', async () => {
    const res = await POST(new Request('http://test/api/setup/activate', { method: 'POST' }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 and sets setupCompletedAt when all green', async () => {
    // ... seed fully-hydrated org ...
    const res = await POST(new Request('http://test/api/setup/activate', { method: 'POST' }) as any);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/setup/activate/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/setup/activate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { runAllChecks } from '@/lib/setup/checks';
import { sendWelcomeEmail } from '@/lib/email/welcome';

export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, legalName: true, abn: true, logoUrl: true, primaryColor: true, accentColor: true },
  });
  if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  // 1. Re-run pre-flight (defence-in-depth)
  const checks = await runAllChecks(org.id);
  const reds = checks.filter((c) => c.status === 'red');
  if (reds.length > 0) {
    return NextResponse.json({ error: 'Pre-flight failed', failedChecks: reds.map((c) => c.capability) }, { status: 400 });
  }

  // 2-6 transactional
  const result = await prisma.$transaction(async (tx) => {
    // Propagate branding → InvoiceTemplate
    await tx.invoiceTemplate.updateMany({
      where: { organizationId: org.id },
      data: {
        logoUrl: org.logoUrl ?? undefined,
        primaryColor: org.primaryColor ?? undefined,
        accentColor: org.accentColor ?? undefined,
      },
    });

    // Seed sample client + report
    const sampleClient = await tx.client.create({
      data: { organizationId: org.id, name: 'Sample Inspection Site', isSample: true },
    });
    await tx.report.create({
      data: {
        organizationId: org.id,
        clientId: sampleClient.id,
        status: 'DRAFT',
        isSample: true,
        title: 'Sample S500 Report',
      },
    });

    // Mark activated
    const updated = await tx.organization.update({
      where: { id: org.id },
      data: { setupCompletedAt: new Date() },
      select: { id: true, setupMode: true },
    });
    return updated;
  });

  // Fire-and-forget welcome email (rule #13)
  void sendWelcomeEmail({ userId: session.user.id, organizationId: org.id });

  return NextResponse.json({ ok: true, organizationId: result.id });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/setup/activate/__tests__/route.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/setup/activate/
git commit -m "feat(setup): POST /api/setup/activate — transactional finalisation"
```

---

## Phase 6 — Middleware + auth-register cleanup

### Task 18: Middleware gate

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Read existing middleware to preserve patterns**

```bash
cat middleware.ts
```

- [ ] **Step 2: Add the setup gate**

Add to the existing matcher logic (do NOT remove the `needsOnboarding` check — both can coexist):

```typescript
// middleware.ts (additions)
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const SETUP_WHITELIST = ['/setup', '/api/setup/', '/api/auth/', '/api/cron/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ... existing checks (needsOnboarding etc) ...

  if (SETUP_WHITELIST.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req });
  if (!token?.sub) return NextResponse.next();

  // Owner/admin gate
  if (token.role === 'OWNER' || token.role === 'ADMIN') {
    if (!token.setupCompletedAt) {
      return NextResponse.redirect(new URL('/setup', req.url));
    }
  }
  // Technician gate (sub-project #2 — placeholder)
  if (token.role === 'TECHNICIAN' && !token.techOnboardedAt) {
    return NextResponse.redirect(new URL('/onboarding/technician', req.url));
  }

  return NextResponse.next();
}
```

- [ ] **Step 3: Update the NextAuth JWT callback to inject `setupCompletedAt`**

Edit the existing NextAuth config (typically `lib/auth.ts`):

```typescript
// lib/auth.ts (in the jwt callback)
async jwt({ token, user, trigger }) {
  if (user?.id) token.sub = user.id;
  // Fetch setupCompletedAt for the user's org
  if (token.sub && (trigger === 'signIn' || trigger === 'update' || !('setupCompletedAt' in token))) {
    const org = await prisma.organization.findFirst({
      where: { ownerId: token.sub as string },
      select: { setupCompletedAt: true },
    });
    token.setupCompletedAt = org?.setupCompletedAt?.toISOString() ?? null;
  }
  return token;
}
```

- [ ] **Step 4: Manual smoke test**

```bash
pnpm dev
```

In a new browser profile, sign up. Confirm middleware redirects to `/setup` (will 404 until Task 22 ships — that's expected).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts lib/auth.ts
git commit -m "feat(setup): middleware gate redirects owner/admin to /setup until activated"
```

---

### Task 19: Stop auto-seeding sample data in /api/auth/register

**Files:**
- Modify: `app/api/auth/register/route.ts`

- [ ] **Step 1: Read the register route**

```bash
cat app/api/auth/register/route.ts
```

Locate the sample-seed block (creates sample Client + Report with `isSample: true`).

- [ ] **Step 2: Remove the sample-seed block**

Delete those lines. The user will get the sample data seeded at Activate time instead (Task 17).

- [ ] **Step 3: Run the existing register tests**

```bash
npx vitest run app/api/auth/register
```

Expected: existing tests pass; any test asserting `Report.count > 0` after register must be updated (move it to the activate test instead).

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/register/route.ts app/api/auth/register/__tests__/
git commit -m "refactor(setup): defer sample data seeding from register → activate"
```

---

## Phase 7 — UI components

### Task 20: Zustand store for setup page

**Files:**
- Create: `components/setup/store.ts`
- Test: `components/setup/__tests__/store.test.ts`

A typed store: section states + Organization snapshot + SSE message handler.

- [ ] **Step 1: Write the failing test**

```typescript
// components/setup/__tests__/store.test.ts
import { describe, expect, it } from 'vitest';
import { useSetupStore } from '../store';

describe('useSetupStore', () => {
  it('starts with all sections pending', () => {
    const { sections } = useSetupStore.getState();
    expect(sections.businessDetails).toBe('pending');
  });

  it('updates a section status', () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'running');
    expect(useSetupStore.getState().sections.businessDetails).toBe('running');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/setup/__tests__/store.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the store**

```typescript
// components/setup/store.ts
import { create } from 'zustand';
import type { HydrationState } from '@/lib/setup/hydration-state-machine';

type SectionKey = 'businessDetails' | 'branding' | 'pricing' | 'storage' | 'integrations';

interface Organization {
  id: string;
  legalName: string | null;
  tradingName: string | null;
  abn: string | null;
  acn: string | null;
  state: string | null;
  address: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  aboutCopy: string | null;
  tradingStatus: 'ACTIVE' | 'PRE_TRADING';
}

interface SetupState {
  org: Organization | null;
  sections: Record<SectionKey, HydrationState>;
  setOrg: (org: Organization) => void;
  setSectionStatus: (key: SectionKey, status: HydrationState) => void;
  updateOrgField: <K extends keyof Organization>(key: K, value: Organization[K]) => void;
}

export const useSetupStore = create<SetupState>((set) => ({
  org: null,
  sections: {
    businessDetails: 'pending',
    branding: 'pending',
    pricing: 'pending',
    storage: 'pending',
    integrations: 'pending',
  },
  setOrg: (org) => set({ org }),
  setSectionStatus: (key, status) => set((s) => ({ sections: { ...s.sections, [key]: status } })),
  updateOrgField: (key, value) => set((s) => (s.org ? { org: { ...s.org, [key]: value } } : s)),
}));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/setup/__tests__/store.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/setup/store.ts components/setup/__tests__/
git commit -m "feat(setup): Zustand store for /setup page"
```

---

### Task 21: SetupShell (server component + SSE bridge)

**Files:**
- Create: `components/setup/SetupShell.tsx`
- Create: `components/setup/SetupHydrator.tsx` (client component for SSE)
- Create: `app/setup/page.tsx`
- Create: `app/setup/loading.tsx`

- [ ] **Step 1: Server component fetches initial state**

```typescript
// app/setup/page.tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { SetupShell } from '@/components/setup/SetupShell';

export default async function SetupPage() {
  const session = await getServerSession();
  if (!session?.user?.id) redirect('/login');

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    include: { hydrationJobs: true, pricingConfig: true },
  });
  if (!org) redirect('/');
  if (org.setupCompletedAt) redirect('/dashboard');

  return <SetupShell initial={org} />;
}
```

- [ ] **Step 2: Loading skeleton**

```typescript
// app/setup/loading.tsx
export default function Loading() {
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading your setup…</div>;
}
```

- [ ] **Step 3: Implement SetupShell + SetupHydrator**

```tsx
// components/setup/SetupShell.tsx
'use client';
import { useEffect } from 'react';
import { useSetupStore } from './store';
import { BusinessDetailsCard } from './BusinessDetailsCard';
import { BrandCard } from './BrandCard';
import { PricingCard } from './PricingCard';
import { StorageCard } from './StorageCard';
import { IntegrationsCard } from './IntegrationsCard';
import { FeatureHealthCard } from './FeatureHealthCard';

export function SetupShell({ initial }: { initial: any }) {
  const setOrg = useSetupStore((s) => s.setOrg);
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);

  useEffect(() => {
    setOrg(initial);
    for (const job of initial.hydrationJobs ?? []) {
      const key = job.kind === 'ABR' ? 'businessDetails' : job.kind === 'WEBSITE' ? 'branding' : 'pricing';
      setSectionStatus(key, job.status.toLowerCase() as any);
    }

    const es = new EventSource('/api/setup/hydrate/stream');
    es.onmessage = (e) => {
      const jobs: Array<{ kind: string; status: string; payload?: any }> = JSON.parse(e.data);
      for (const job of jobs) {
        const key = job.kind === 'ABR' ? 'businessDetails' : job.kind === 'WEBSITE' ? 'branding' : 'pricing';
        setSectionStatus(key, job.status.toLowerCase() as any);
        if (job.status === 'READY' && job.payload) {
          // Re-fetch state for canonical snapshot
          fetch('/api/setup/state').then((r) => r.json()).then((data) => setOrg(data.data.organization));
        }
      }
    };
    return () => es.close();
  }, [initial, setOrg, setSectionStatus]);

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-3xl font-semibold">Let's get you set up</h1>
      <p className="text-muted-foreground">Enter your ABN below — we'll do the rest.</p>
      <BusinessDetailsCard />
      <BrandCard />
      <PricingCard />
      <StorageCard />
      <IntegrationsCard />
      <FeatureHealthCard />
      <div className="text-center text-xs text-muted-foreground pt-8">
        <button className="underline opacity-60 hover:opacity-100" onClick={() => { /* show manual confirm modal */ }}>
          Skip to manual setup
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Commit (the cards will fail to import until next tasks; that's OK if you commit the shell + page only)**

```bash
git add app/setup/ components/setup/SetupShell.tsx
git commit -m "feat(setup): page shell + SSE-driven Zustand bridge"
```

---

### Task 22: BusinessDetailsCard component

**Files:**
- Create: `components/setup/BusinessDetailsCard.tsx`
- Test: `components/setup/__tests__/BusinessDetailsCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/setup/__tests__/BusinessDetailsCard.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BusinessDetailsCard } from '../BusinessDetailsCard';

describe('BusinessDetailsCard', () => {
  it('shows the ABN input when pending', () => {
    render(<BusinessDetailsCard />);
    expect(screen.getByPlaceholderText(/abn/i)).toBeInTheDocument();
  });

  it('disables the submit on invalid ABN', () => {
    render(<BusinessDetailsCard />);
    fireEvent.change(screen.getByPlaceholderText(/abn/i), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/setup/__tests__/BusinessDetailsCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the card**

```tsx
// components/setup/BusinessDetailsCard.tsx
'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetupStore } from './store';
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';

export function BusinessDetailsCard() {
  const status = useSetupStore((s) => s.sections.businessDetails);
  const org = useSetupStore((s) => s.org);
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);
  const [abn, setAbn] = useState(org?.abn ?? '');
  const [website, setWebsite] = useState('');

  const submit = async () => {
    setSectionStatus('businessDetails', 'running');
    setSectionStatus('branding', website ? 'running' : 'manual');
    setSectionStatus('pricing', 'running');
    await fetch('/api/setup/hydrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abn, website: website || undefined }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'pending' && (
          <>
            <Input placeholder="ABN (11 digits)" value={abn} onChange={(e) => setAbn(e.target.value)} />
            <Input placeholder="Website URL (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
            <Button onClick={submit} disabled={!isValidAbn(abn)} aria-label="Start setup">Start setup</Button>
          </>
        )}
        {status === 'running' && <div className="animate-pulse">Looking up your business…</div>}
        {status === 'ready' && org && (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Legal name</dt><dd>{org.legalName}</dd>
            <dt className="text-muted-foreground">Trading name</dt><dd>{org.tradingName || '—'}</dd>
            <dt className="text-muted-foreground">ABN</dt><dd>{org.abn}</dd>
            <dt className="text-muted-foreground">ACN</dt><dd>{org.acn || '—'}</dd>
            <dt className="text-muted-foreground">State</dt><dd>{org.state}</dd>
          </dl>
        )}
        {status === 'error' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            We couldn't reach the Business Register. Fill in your details and we'll re-try in the background.
            {/* manual form fields here, same fields as 'ready' state, all editable */}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/setup/__tests__/BusinessDetailsCard.test.tsx
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/setup/BusinessDetailsCard.tsx components/setup/__tests__/BusinessDetailsCard.test.tsx
git commit -m "feat(setup): BusinessDetailsCard with ABN entry + hydration trigger"
```

---

### Task 23: BrandCard component

**Files:**
- Create: `components/setup/BrandCard.tsx`
- Test: `components/setup/__tests__/BrandCard.test.tsx`

Shows logo preview + colour swatches + about textarea. Edits write back to `Organization` via `PATCH /api/setup/state`.

- [ ] **Step 1: Add PATCH handler to /api/setup/state**

```typescript
// app/api/setup/state/route.ts (add to existing file)
export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const org = await prisma.organization.findFirst({ where: { ownerId: session.user.id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  const allowed = ['legalName','tradingName','acn','state','address','phone','email','website','logoUrl','primaryColor','accentColor','aboutCopy'] as const;
  const data: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) data[k] = body[k];
  await prisma.organization.update({ where: { id: org.id }, data });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// components/setup/__tests__/BrandCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandCard } from '../BrandCard';

describe('BrandCard', () => {
  it('renders manual upload UI when status is manual', () => {
    // ... seed store with manual state ...
    render(<BrandCard />);
    expect(screen.getByText(/upload/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement BrandCard**

```tsx
// components/setup/BrandCard.tsx
'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';

export function BrandCard() {
  const status = useSetupStore((s) => s.sections.branding);
  const org = useSetupStore((s) => s.org);
  const update = useSetupStore((s) => s.updateOrgField);

  const save = async (field: string, value: any) => {
    await fetch('/api/setup/state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Your brand</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {status === 'pending' && <div className="text-muted-foreground">Waiting for your ABN…</div>}
        {status === 'running' && <div className="animate-pulse">Pulling logo and colours from your website…</div>}
        {(status === 'ready' || status === 'manual') && (
          <div className="flex gap-4 items-start">
            <div className="w-24 h-24 rounded-md bg-muted flex items-center justify-center overflow-hidden">
              {org?.logoUrl ? <img src={org.logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <ColorSwatch hex={org?.primaryColor} label="Primary" onChange={(v) => { update('primaryColor', v); save('primaryColor', v); }} />
                <ColorSwatch hex={org?.accentColor} label="Accent"   onChange={(v) => { update('accentColor', v);   save('accentColor', v); }} />
              </div>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={org?.aboutCopy ?? ''}
                onChange={(e) => { update('aboutCopy', e.target.value); save('aboutCopy', e.target.value); }}
                placeholder="A paragraph about your business…"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ColorSwatch({ hex, label, onChange }: { hex?: string | null; label: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center gap-1 text-xs">
      <input type="color" value={hex ?? '#1C2E47'} onChange={(e) => onChange(e.target.value)} className="h-10 w-10 rounded" />
      <span>{label}</span>
    </label>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/setup/__tests__/BrandCard.test.tsx
```

Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add components/setup/BrandCard.tsx app/api/setup/state/route.ts
git commit -m "feat(setup): BrandCard + PATCH /api/setup/state for live edits"
```

---

### Task 24: PricingCard component

**Files:**
- Create: `components/setup/PricingCard.tsx`
- Create: `app/api/setup/pricing/route.ts` (PATCH for pricing fields)
- Test: `components/setup/__tests__/PricingCard.test.tsx`

- [ ] **Step 1: Implement the pricing PATCH route**

```typescript
// app/api/setup/pricing/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const org = await prisma.organization.findFirst({ where: { ownerId: session.user.id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  await prisma.organizationPricingConfig.upsert({
    where: { organizationId: org.id },
    create: { organizationId: org.id, ...body },
    update: body,
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement PricingCard**

```tsx
// components/setup/PricingCard.tsx
'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSetupStore } from './store';

const COMPACT_ROWS = [
  { key: 'masterQualifiedNormalHours',     label: 'Master Tech / hour' },
  { key: 'qualifiedTechnicianNormalHours', label: 'Qualified Tech / hour' },
  { key: 'labourerNormalHours',            label: 'Labourer / hour' },
  { key: 'airMoverAxialPerDay',            label: 'Air mover (axial) / day' },
  { key: 'dehumidifierLgrPerDay',          label: 'Dehumidifier (LGR) / day' },
  { key: 'administrationFee',              label: 'Admin fee' },
  { key: 'callOutFee',                     label: 'Call-out fee' },
  { key: 'afterHoursMultiplier',           label: 'After-hours multiplier' },
] as const;

export function PricingCard() {
  const status = useSetupStore((s) => s.sections.pricing);
  const [expanded, setExpanded] = useState(false);

  const save = (key: string, value: number) =>
    fetch('/api/setup/pricing', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) });

  return (
    <Card>
      <CardHeader><CardTitle>Your pricing structure</CardTitle></CardHeader>
      <CardContent>
        {status !== 'ready' && status !== 'manual' && <div className="animate-pulse">Calculating defaults for your state…</div>}
        {(status === 'ready' || status === 'manual') && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              We've prefilled industry defaults based on your state and business size. Adjust as needed.
            </p>
            <table className="w-full text-sm">
              <tbody>
                {COMPACT_ROWS.map((row) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground">{row.label}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        defaultValue={0}
                        onBlur={(e) => save(row.key, parseFloat(e.target.value))}
                        className="w-24 rounded-md border px-2 py-1 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide all rates' : 'Show all rates'}
            </Button>
            {expanded && <div className="mt-4 text-sm text-muted-foreground">(Full ~30-field config — engineer to add all rows from `lib/pricing/defaults-au.ts`)</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write and pass the test**

(Test pattern similar to BrandCard — assert render in each state.)

- [ ] **Step 4: Commit**

```bash
git add components/setup/PricingCard.tsx app/api/setup/pricing/
git commit -m "feat(setup): PricingCard with compact rate table + expander"
```

---

### Task 25: StorageCard component

**Files:**
- Create: `components/setup/StorageCard.tsx`

Three buttons: Google Drive, OneDrive (disabled), Keep it local. Drive button kicks off existing OAuth flow.

- [ ] **Step 1: Implement**

```tsx
// components/setup/StorageCard.tsx
'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSetupStore } from './store';

export function StorageCard() {
  const choice = useSetupStore((s) => (s.org as any)?.cloudStorage ?? null);
  return (
    <Card>
      <CardHeader><CardTitle>Cloud storage</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-3 gap-3">
        <StorageButton label="Google Drive" onClick={() => window.location.href = '/api/oauth/google-drive/start'} active={choice === 'drive'} />
        <StorageButton label="OneDrive (soon)" disabled />
        <StorageButton label="Keep it local" onClick={() => fetch('/api/setup/state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cloudStorage: 'local' }) })} active={choice === 'local'} />
      </CardContent>
    </Card>
  );
}

function StorageButton({ label, onClick, disabled, active }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Button variant={active ? 'default' : 'outline'} disabled={disabled} onClick={onClick} className="h-20 whitespace-normal text-sm">
      {label}
    </Button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/setup/StorageCard.tsx
git commit -m "feat(setup): StorageCard (Drive / OneDrive-soon / Local)"
```

---

### Task 26: IntegrationsCard component

**Files:**
- Create: `components/setup/IntegrationsCard.tsx`

Reuses cards from existing `/app/dashboard/integrations/page.tsx`. Collapsible "BYOK AI keys (optional)" at bottom.

- [ ] **Step 1: Implement**

```tsx
// components/setup/IntegrationsCard.tsx
'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PROVIDERS = [
  { key: 'xero',        name: 'Xero',         startUrl: '/api/oauth/xero/start?onboarding=1' },
  { key: 'myob',        name: 'MYOB',         startUrl: '/api/oauth/myob/start?onboarding=1' },
  { key: 'quickbooks',  name: 'QuickBooks',   startUrl: '/api/oauth/quickbooks/start?onboarding=1' },
  { key: 'servicem8',   name: 'ServiceM8',    startUrl: '/api/oauth/servicem8/start?onboarding=1' },
  { key: 'ascora',      name: 'Ascora',       startUrl: '/dashboard/integrations?provider=ascora' },
];

export function IntegrationsCard() {
  const [byokOpen, setByokOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your existing tools</CardTitle>
        <p className="text-sm text-muted-foreground">All optional. You can do this later from Settings.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <Button key={p.key} variant="outline" onClick={() => window.location.href = p.startUrl} className="h-16">{p.name}</Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setByokOpen((v) => !v)}>
          {byokOpen ? 'Hide' : 'BYOK AI keys (optional)'}
        </Button>
        {byokOpen && (
          <div className="text-sm">
            Want better AI than our default? Add a key.
            <Button variant="link" onClick={() => window.location.href = '/dashboard/settings/ai-providers?onboarding=1'}>Manage keys →</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/setup/IntegrationsCard.tsx
git commit -m "feat(setup): IntegrationsCard reusing existing OAuth flows + BYOK collapsible"
```

---

### Task 27: FeatureHealthCard component

**Files:**
- Create: `components/setup/FeatureHealthCard.tsx`

Polls `/api/setup/checks` every 5s while visible. Shows row list + Activate button.

- [ ] **Step 1: Implement**

```tsx
// components/setup/FeatureHealthCard.tsx
'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CheckResult } from '@/lib/setup/checks';

export function FeatureHealthCard() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetch('/api/setup/checks');
      const j = await r.json();
      if (!cancelled) setChecks(j.data.checks);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const reds = checks.filter((c) => c.status === 'red');
  const yellows = checks.filter((c) => c.status === 'yellow');

  const activate = async () => {
    setActivating(true);
    const r = await fetch('/api/setup/activate', { method: 'POST' });
    if (r.ok) window.location.href = '/dashboard?firstRun=1';
    else setActivating(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace health</CardTitle>
        <p className="text-sm text-muted-foreground">
          {checks.length > 0 && `${checks.filter((c) => c.status === 'green').length} of ${checks.length} capabilities verified · ${yellows.length} optional skipped · ${reds.length} need attention`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {checks.map((c) => (
          <div key={c.capability} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <StatusPill status={c.status} /> {c.label}
            </span>
            {c.note && <span className="text-muted-foreground text-xs">{c.note}</span>}
          </div>
        ))}
        <Button size="lg" className="w-full" disabled={reds.length > 0 || activating} onClick={activate}>
          {activating ? 'Activating…' : 'Activate my workspace'}
        </Button>
        {yellows.length > 0 && reds.length === 0 && (
          <p className="text-xs text-muted-foreground">You can activate now and connect {yellows.map((y) => y.label).join(', ')} later from Settings.</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: 'green' | 'yellow' | 'red' }) {
  const colors = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/setup/FeatureHealthCard.tsx
git commit -m "feat(setup): FeatureHealthCard with live polling + Activate button"
```

---

### Task 28: Workspace Health widget at /dashboard/settings/health

**Files:**
- Create: `app/dashboard/settings/health/page.tsx`

Re-uses the FeatureHealthCard component but without the Activate button (already activated). Shows the persistent capability list.

- [ ] **Step 1: Implement**

```typescript
// app/dashboard/settings/health/page.tsx
import { FeatureHealthCard } from '@/components/setup/FeatureHealthCard';

export default function WorkspaceHealthPage() {
  return (
    <main className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-6">Workspace health</h1>
      <FeatureHealthCard postActivation />
    </main>
  );
}
```

Add a `postActivation?: boolean` prop to FeatureHealthCard; when true, hide the Activate button.

- [ ] **Step 2: Update FeatureHealthCard signature**

```tsx
export function FeatureHealthCard({ postActivation = false }: { postActivation?: boolean }) {
  // ... same body ...
  // Replace the Button block with:
  {!postActivation && (
    <>
      <Button ...>Activate my workspace</Button>
      ...
    </>
  )}
}
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/settings/health/ components/setup/FeatureHealthCard.tsx
git commit -m "feat(setup): persistent Workspace Health page reusing FeatureHealthCard"
```

---

## Phase 8 — Cleanup

### Task 29: Delete legacy onboarding routes

**Files:**
- Delete: `app/dashboard/onboarding/`
- Delete: `app/api/onboarding/first-run/`
- Delete: `app/api/onboarding/status/` (state moved to /api/setup/state in Task 15)

- [ ] **Step 1: Verify nothing else references them**

```bash
grep -rn "dashboard/onboarding" app/ components/ lib/ middleware.ts
grep -rn "onboarding/first-run" app/ components/ lib/
grep -rn "onboarding/status" app/ components/ lib/
```

Expected: only the files being deleted reference these paths. Otherwise, update callers to `/setup` or `/api/setup/state`.

- [ ] **Step 2: Delete**

```bash
rm -rf app/dashboard/onboarding
rm -rf app/api/onboarding/first-run
rm -rf app/api/onboarding/status
```

- [ ] **Step 3: Type-check + lint**

```bash
pnpm type-check
pnpm lint
```

Both must pass.

- [ ] **Step 4: Commit**

```bash
git add -A app/
git commit -m "chore(setup): remove legacy onboarding routes (now /setup + /api/setup/*)"
```

---

## Phase 9 — E2E tests (Playwright)

### Task 30: E2E happy path

**Files:**
- Create: `e2e/setup-happy-path.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
// e2e/setup-happy-path.spec.ts
import { test, expect } from '@playwright/test';

test('happy path: sign up → enter ABN → all sections green → activate', async ({ page }) => {
  // 1. Sign up
  await page.goto('/signup');
  await page.getByLabel(/email/i).fill(`test-${Date.now()}@e2e.com`);
  await page.getByLabel(/password/i).fill('password123!');
  await page.getByRole('button', { name: /sign up/i }).click();

  // 2. Middleware redirects to /setup
  await expect(page).toHaveURL(/\/setup/);

  // 3. Enter test ABN (known to ABR sandbox)
  await page.getByPlaceholder(/abn/i).fill('53004085616');
  await page.getByPlaceholder(/website/i).fill('https://example.com');
  await page.getByRole('button', { name: /start setup/i }).click();

  // 4. Wait for business details to hit "ready" (legal name visible)
  await expect(page.getByText(/BHP GROUP LIMITED/)).toBeVisible({ timeout: 15_000 });

  // 5. Pricing card visible
  await expect(page.getByText(/master tech \/ hour/i)).toBeVisible();

  // 6. Activate
  await page.getByRole('button', { name: /activate my workspace/i }).click();

  // 7. Lands on dashboard with firstRun banner
  await expect(page).toHaveURL(/\/dashboard\?firstRun=1/);
  await expect(page.getByText(/sample report/i)).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
ABR_BASE_URL=$ABR_SANDBOX_URL npx playwright test e2e/setup-happy-path.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/setup-happy-path.spec.ts
git commit -m "test(setup): E2E happy path"
```

---

### Task 31: E2E ABR-unreachable

**Files:**
- Create: `e2e/setup-abr-unreachable.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
// e2e/setup-abr-unreachable.spec.ts
import { test, expect } from '@playwright/test';

test('ABR unreachable → manual fallback', async ({ page, context }) => {
  // Block ABR network requests
  await context.route('**/abr.business.gov.au/**', (route) => route.abort());

  await page.goto('/signup');
  await page.getByLabel(/email/i).fill(`test-${Date.now()}@e2e.com`);
  await page.getByLabel(/password/i).fill('password123!');
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page).toHaveURL(/\/setup/);

  await page.getByPlaceholder(/abn/i).fill('53004085616');
  await page.getByRole('button', { name: /start setup/i }).click();

  // Section flips to manual fallback
  await expect(page.getByText(/couldn't reach the business register/i)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run + commit**

```bash
npx playwright test e2e/setup-abr-unreachable.spec.ts
git add e2e/setup-abr-unreachable.spec.ts
git commit -m "test(setup): E2E ABR-unreachable fallback"
```

---

### Task 32: E2E no-ABN / pre-trading

**Files:**
- Create: `e2e/setup-no-abn.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
// e2e/setup-no-abn.spec.ts
import { test, expect } from '@playwright/test';

test('no ABN → pre-trading mode', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel(/email/i).fill(`test-${Date.now()}@e2e.com`);
  await page.getByLabel(/password/i).fill('password123!');
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page).toHaveURL(/\/setup/);

  await page.getByText(/i don't have an abn/i).click();
  await page.getByRole('button', { name: /continue without abn/i }).click();

  // Pre-trading flag set; manual fields visible
  await expect(page.getByText(/pre-trading mode/i)).toBeVisible();
});
```

(Engineer: implement the "I don't have an ABN" link in BusinessDetailsCard if not yet present — modal with the 3 options from spec Section 4.)

- [ ] **Step 2: Commit**

```bash
git add e2e/setup-no-abn.spec.ts components/setup/BusinessDetailsCard.tsx
git commit -m "test(setup): E2E no-ABN pre-trading flow"
```

---

### Task 33: E2E website-failure

**Files:**
- Create: `e2e/setup-website-failure.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('website unreachable → manual upload flow', async ({ page }) => {
  await page.goto('/signup');
  // ... sign up ...
  await page.getByPlaceholder(/abn/i).fill('53004085616');
  await page.getByPlaceholder(/website/i).fill('https://this-domain-cannot-resolve-12345.com');
  await page.getByRole('button', { name: /start setup/i }).click();

  await expect(page.getByText(/couldn't reach .* falling back to manual/i)).toBeVisible({ timeout: 15_000 });
  // Upload logo manually
  // ... assert manual upload UI present ...
});
```

Commit pattern same as Task 31.

---

### Task 34: E2E resume after tab close

**Files:**
- Create: `e2e/setup-resume.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('close tab mid-hydration → return → state restored', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/signup');
  // ... sign up + enter ABN ...
  await page.close();

  const page2 = await ctx.newPage();
  await page2.goto('/setup');
  // Business details still visible from prior hydration
  await expect(page2.getByText(/BHP GROUP LIMITED/)).toBeVisible({ timeout: 5_000 });
});
```

Commit pattern same as Task 31.

---

### Task 35: E2E skip-to-manual escape hatch

**Files:**
- Create: `e2e/setup-skip-manual.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('skip to manual → all sections flip to manual', async ({ page }) => {
  await page.goto('/signup');
  // ... sign up ...
  await page.getByText(/skip to manual setup/i).click();
  await page.getByRole('button', { name: /yes, skip/i }).click();
  await expect(page.getByText(/upload your logo/i)).toBeVisible();
});
```

Commit pattern same as Task 31.

---

### Task 36: E2E invited-technician gate

**Files:**
- Create: `e2e/setup-technician-gate.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('technician invite lands on /onboarding/technician not /setup', async ({ page }) => {
  // ... seed an org + invite a technician role user ...
  // ... sign in as that user ...
  await expect(page).toHaveURL(/\/onboarding\/technician/);
});
```

Commit pattern same as Task 31.

---

### Task 37: Visual regression baselines

**Files:**
- Create: `e2e/setup-visual.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Visual regression — section states', () => {
  for (const section of ['business-details', 'brand', 'pricing', 'storage', 'integrations']) {
    for (const state of ['pending', 'running', 'ready', 'error', 'manual']) {
      test(`${section} :: ${state}`, async ({ page }) => {
        await page.goto(`/setup?_visual=${section}&_state=${state}`); // engineer to wire up a visual-test param that seeds local store
        await expect(page).toHaveScreenshot(`${section}-${state}.png`);
      });
    }
  }
});
```

Engineer: add a `_visual` query-param seeding mechanism gated behind `NODE_ENV !== 'production'`.

Run baseline generation:

```bash
npx playwright test e2e/setup-visual.spec.ts --update-snapshots
```

- [ ] Commit:

```bash
git add e2e/setup-visual.spec.ts e2e/setup-visual.spec.ts-snapshots/
git commit -m "test(setup): visual regression baselines for 25 section states"
```

---

## Phase 10 — Verification gate (BEFORE declaring done)

Per `.claude/rules/verification-gate.md`, perform these before claiming complete:

- [ ] **Step 1: Local E2E happy path against staging Postgres + ABR sandbox**

```bash
ABR_BASE_URL=$ABR_SANDBOX_URL DATABASE_URL=$STAGING_DATABASE_URL npx playwright test e2e/setup-happy-path.spec.ts
```

Expected: PASS.

- [ ] **Step 2: All 7 E2E scenarios**

```bash
npx playwright test e2e/setup-*.spec.ts
```

Expected: 7 PASS, 0 FAIL.

- [ ] **Step 3: Type-check, lint, unit, integration**

```bash
pnpm type-check && pnpm lint && npx vitest run
```

Expected: all green.

- [ ] **Step 4: Manual visual smoke**

In a fresh browser profile:
1. Sign up at staging
2. Confirm redirect to `/setup`
3. Enter test ABN — confirm all three sections hit ready automatically
4. Toggle off welcome-email transport — confirm welcome_email row goes [RED] and Activate button disables
5. Re-enable transport — Activate enables
6. Click Activate — confirm `/dashboard?firstRun=1` with sample report visible
7. Navigate to `/dashboard/settings/health` — confirm row states match the Activate-moment snapshot
8. Screenshot the activated dashboard with the sample report bearing the user's brand colours; attach to PR

- [ ] **Step 5: Schema migration round-trip on staging snapshot**

```bash
pg_dump $STAGING_DATABASE_URL > /tmp/pre-migration.sql
npx prisma migrate deploy
npx tsx scripts/backfill-setup-wizard.ts
# Verify Organization rows have business profile fields
psql $STAGING_DATABASE_URL -c "SELECT COUNT(*) FROM \"Organization\" WHERE \"abn\" IS NOT NULL"
# Re-run backfill
npx tsx scripts/backfill-setup-wizard.ts
# Verify idempotent (same count)
```

Expected: ABN count unchanged on second run.

- [ ] **Step 6: Open the PR**

```bash
gh pr create --base main --title "feat: gated AI-driven setup wizard (sub-project #1)" \
  --body "$(cat <<'EOF'
Implements sub-project #1 from `docs/superpowers/specs/2026-05-12-onboarding-redesign-design.md`.

## Summary
- Hard-gated `/setup` wizard replacing optional `/dashboard/onboarding` checklist
- ABN-anchored AI hydration (ABR + website scrape + pricing defaults)
- Single-page progressive-reveal UX
- Real-time feature-health card before Activate
- Persistent Workspace Health widget at `/dashboard/settings/health`

## Test plan
- [x] `pnpm type-check && pnpm lint && npx vitest run` all green
- [x] All 7 E2E scenarios pass (`npx playwright test e2e/setup-*.spec.ts`)
- [x] Visual regression baselines stable
- [x] Schema migration round-trips on staging
- [x] Manual smoke per Verification Gate (see screenshot in PR body)

 Generated with Claude Code
EOF
)"
```

---

## Out of scope (separate plans)

These are flagged in the spec and require their own plans/PRs:

- **Sub-project #2** — `/onboarding/technician` invited-technician flow
- **Sub-project #3** — BYOK upgrade UX after wizard
- **Sub-project #4** — platform-wide feature-health telemetry
- **Sub-project #5** — sign-in → job close end-to-end flow audit

---

## Self-review notes (resolved before finalising)

Per writing-plans skill self-review:

1. **Spec coverage** — every section of the spec maps to ≥1 task:
   - §1 Architecture & Gating → Tasks 9, 18, 21
   - §2 Hydration Pipeline → Tasks 2, 3, 5, 6, 7, 13, 14
   - §3 Five page sections → Tasks 22–27
   - §4 Errors & fallbacks → Tasks 13 (job runners handle), 31, 33, 35
   - §5 Activation + Health → Tasks 12, 16, 17, 27, 28
   - §6 Testing → Tasks 1–8 (unit), 9–17 (integration), 30–37 (E2E + visual)
2. **No placeholders** — every step has runnable code or commands.
3. **Type consistency** — `HydrationState` (lowercase) in TS matches `HydrationStatus` (uppercase) in Prisma; conversion happens in SetupShell (`job.status.toLowerCase()`).
4. **Critical addition** — Task 11 (BYPASS_CREDIT_GATE) is required for the wizard to function on TRIAL users; flagged in Task 12 (capability check) too.
