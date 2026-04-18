/**
 * RA-869: Xero Account Code Resolver
 *
 * Resolves the correct Xero account code and tax type for each line item
 * on an invoice before syncing to Xero. Replaces the coarse single-code-per-invoice
 * approach (tied to damage type) with per-category routing. Enables proper
 * P&L breakdown by cost category in Xero.
 *
 * Resolution priority (highest to lowest):
 *   1. InvoiceLineItem.xeroAccountCode — explicit per-item override (validated)
 *   2. XeroAccountCodeMapping row matching the line item's category
 *   3. XeroAccountCodeMapping with category = null (per-integration default)
 *   4. Built-in defaults (hardcoded codes 200–205 per canonical category)
 *   5. Global fallback (200 — general income)
 *
 * Performance:
 *   - Per-integration mapping set is cached in-process for 5 minutes.
 *   - Cache has an LRU bound (100 integrations) to prevent unbounded growth.
 *   - Batch resolver (resolveAccountCodes) performs a single DB round-trip.
 *
 * Never throws — always returns a valid account code / tax type pair.
 * A failure to resolve never blocks an invoice sync.
 */

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Canonical line item categories for Xero account routing.
 * Raw category strings from user data are normalised to one of these via
 * {@link normalizeCategory} before lookup.
 */
export type LineItemCategory =
  | "LABOUR"
  | "EQUIPMENT"
  | "CHEMICALS"
  | "MATERIALS"
  | "SUBCONTRACTOR"
  | "ADMIN"
  | "COMPLIANCE"
  | "WASTE"
  | "TRAVEL"
  | "PRELIMS"
  | "CONTENTS";

/**
 * Accepted for future extension — the current schema doesn't scope mappings
 * by damage type, so this parameter is accepted but unused.
 */
export type DamageType = "WATER" | "FIRE" | "MOULD" | "STORM" | "GENERAL";

export interface ResolvedAccountCode {
  accountCode: string;
  taxType: string;
}

// ─── Built-in defaults ────────────────────────────────────────────────────────

/**
 * Default Xero account codes per canonical category.
 * Each code can be overridden per-deployment via environment variables.
 * Operators can also configure per-integration overrides via XeroAccountCodeMapping.
 */
const DEFAULT_CODES: Record<LineItemCategory, string> = {
  LABOUR: process.env.XERO_ACCOUNT_LABOUR || "310",
  EQUIPMENT: process.env.XERO_ACCOUNT_EQUIPMENT || "320",
  CHEMICALS: process.env.XERO_ACCOUNT_CHEMICALS || "330",
  MATERIALS: process.env.XERO_ACCOUNT_MATERIALS || "330",
  SUBCONTRACTOR: process.env.XERO_ACCOUNT_SUBS || "340",
  ADMIN: process.env.XERO_ACCOUNT_ADMIN || "350",
  COMPLIANCE: process.env.XERO_ACCOUNT_COMPLIANCE || "350",
  WASTE: process.env.XERO_ACCOUNT_WASTE || "330",
  TRAVEL: process.env.XERO_ACCOUNT_TRAVEL || "360",
  PRELIMS: process.env.XERO_ACCOUNT_PRELIMS || "310",
  CONTENTS: "205",
};

const GLOBAL_FALLBACK: ResolvedAccountCode = {
  accountCode: "200",
  taxType: "OUTPUT",
};

// ─── Category normalisation ───────────────────────────────────────────────────

/**
 * Maps raw category strings (case-insensitive, legacy names) to canonical
 * {@link LineItemCategory}. Returns null if the input doesn't match any known category.
 */
const CATEGORY_ALIASES: Record<string, LineItemCategory> = {
  labour: "LABOUR",
  labor: "LABOUR",
  equipment: "EQUIPMENT",
  chemicals: "CHEMICALS",
  materials: "MATERIALS",
  chemical: "MATERIALS", // legacy scope-item category
  subcontractor: "SUBCONTRACTOR",
  subcontractors: "SUBCONTRACTOR",
  admin: "ADMIN",
  administration: "ADMIN",
  compliance: "COMPLIANCE",
  waste: "WASTE",
  "waste disposal": "WASTE",
  travel: "TRAVEL",
  prelims: "PRELIMS",
  preliminaries: "PRELIMS",
  contents: "CONTENTS",
};

export function normalizeCategory(
  raw: string | null | undefined,
): LineItemCategory | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already canonical (exact uppercase match)
  if (trimmed in DEFAULT_CODES) return trimmed as LineItemCategory;
  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const XERO_NUMERIC_CODE_RE = /^\d{3,4}$/;
const XERO_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepts a 3- or 4-digit numeric account code or a Xero GUID.
 * Matches the formats the Xero Accounts API returns.
 */
export function isValidXeroAccountCode(code: string): boolean {
  return XERO_NUMERIC_CODE_RE.test(code) || XERO_GUID_RE.test(code);
}

// ─── LRU + TTL cache ──────────────────────────────────────────────────────────

interface CachedMappings {
  /**
   * DB mappings keyed by the exact category string stored in
   * XeroAccountCodeMapping.category. Case-sensitive — the caller's raw string
   * must match what the user configured in the UI. This supports arbitrary
   * client-defined categories beyond the 6 canonical ones.
   */
  byRawCategory: Map<string, ResolvedAccountCode>;
  /**
   * Same mappings, but keyed by lower-cased category string — allows
   * case-insensitive fallback (e.g. "Labour" line item matches "labour" mapping).
   */
  byLowerCategory: Map<string, ResolvedAccountCode>;
  /**
   * Mappings keyed by normalised canonical category — allows legacy/varied
   * category names in line items to hit user-configured mappings for canonical ones.
   */
  byCanonical: Map<LineItemCategory, ResolvedAccountCode>;
  /**
   * The row with category = null — per-integration default.
   */
  defaultOverride: ResolvedAccountCode | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const mappingCache = new Map<string, CachedMappings>();

function getCached(integrationId: string): CachedMappings | null {
  const cached = mappingCache.get(integrationId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    mappingCache.delete(integrationId);
    return null;
  }
  // Refresh LRU position: delete + reinsert => most-recently-used
  mappingCache.delete(integrationId);
  mappingCache.set(integrationId, cached);
  return cached;
}

function setCache(integrationId: string, entry: CachedMappings): void {
  if (mappingCache.size >= CACHE_MAX_ENTRIES) {
    // Evict least-recently-used (first key — Map preserves insertion order)
    const oldest = mappingCache.keys().next().value;
    if (oldest) mappingCache.delete(oldest);
  }
  mappingCache.set(integrationId, entry);
}

/**
 * Clear the resolver's in-memory cache.
 * Callers: admin endpoint that updates mappings; unit tests between cases.
 */
export function clearAccountCodeCache(integrationId?: string): void {
  if (integrationId) mappingCache.delete(integrationId);
  else mappingCache.clear();
}

async function loadMappings(integrationId: string): Promise<CachedMappings> {
  const cached = getCached(integrationId);
  if (cached) return cached;

  const entry: CachedMappings = {
    byRawCategory: new Map(),
    byLowerCategory: new Map(),
    byCanonical: new Map(),
    defaultOverride: null,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  try {
    // CLAUDE.md rule 4: every findMany requires an explicit take.
    // 500 is well above realistic ceiling (6 canonical + any custom client categories)
    // yet bounds memory + cache size if a runaway mapping accidentally inserts junk rows.
    const rows = await prisma.xeroAccountCodeMapping.findMany({
      where: { integrationId },
      select: { category: true, accountCode: true, taxType: true },
      take: 500,
    });

    for (const r of rows) {
      // Skip invalid codes rather than propagate — log for ops visibility
      if (!isValidXeroAccountCode(r.accountCode)) {
        console.warn(
          `[Xero AccountCodeResolver] Invalid account code "${r.accountCode}" in mapping for integration ${integrationId} — skipping`,
        );
        continue;
      }
      const resolved: ResolvedAccountCode = {
        accountCode: r.accountCode,
        taxType: r.taxType,
      };
      if (r.category === null) {
        entry.defaultOverride = resolved;
      } else {
        // Store under all three lookup paths to support flexible category
        // matching (exact, case-insensitive, canonical).
        entry.byRawCategory.set(r.category, resolved);
        entry.byLowerCategory.set(r.category.toLowerCase(), resolved);
        const normalized = normalizeCategory(r.category);
        if (normalized) entry.byCanonical.set(normalized, resolved);
      }
    }
  } catch (err) {
    console.warn(
      `[Xero AccountCodeResolver] DB lookup failed for integration ${integrationId} — using built-in defaults. ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  setCache(integrationId, entry);
  return entry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ResolveAccountCodeParams {
  integrationId: string;
  lineItemCategory: LineItemCategory | string | null | undefined;
  damageType?: DamageType; // accepted for future extension; not currently used
  xeroAccountCodeOverride?: string | null;
}

/**
 * Resolve account code + tax type for a single line item.
 * Uses the in-process 5-min TTL cache; first call per integration hits the DB.
 *
 * Lookup priority:
 *   1. Explicit per-item override (if valid)
 *   2. Exact DB match on the raw category string (supports client-custom categories)
 *   3. Case-insensitive DB match on the raw category
 *   4. DB match on the normalised canonical category (maps "Labour"↔"LABOUR" etc.)
 *   5. Per-integration default (null-category row)
 *   6. Built-in default for a canonical category
 *   7. Global fallback (200 OUTPUT)
 */
export async function resolveAccountCode(
  params: ResolveAccountCodeParams,
): Promise<ResolvedAccountCode> {
  if (
    params.xeroAccountCodeOverride &&
    isValidXeroAccountCode(params.xeroAccountCodeOverride)
  ) {
    return { accountCode: params.xeroAccountCodeOverride, taxType: "OUTPUT" };
  }

  const raw =
    typeof params.lineItemCategory === "string"
      ? params.lineItemCategory.trim()
      : null;

  const cache = await loadMappings(params.integrationId);

  // 2. Exact raw match — supports arbitrary client-configured categories
  if (raw && cache.byRawCategory.has(raw)) {
    return cache.byRawCategory.get(raw)!;
  }

  // 3. Case-insensitive raw match
  if (raw && cache.byLowerCategory.has(raw.toLowerCase())) {
    return cache.byLowerCategory.get(raw.toLowerCase())!;
  }

  const normalized =
    raw !== null
      ? normalizeCategory(raw)
      : typeof params.lineItemCategory !== "string"
        ? (params.lineItemCategory ?? null)
        : null;

  // 4. Canonical category DB match
  if (normalized && cache.byCanonical.has(normalized)) {
    return cache.byCanonical.get(normalized)!;
  }

  // 5. Per-integration default
  if (cache.defaultOverride) return cache.defaultOverride;

  // 6. Built-in default for canonical category
  if (normalized) {
    return { accountCode: DEFAULT_CODES[normalized], taxType: "OUTPUT" };
  }

  // 7. Global fallback
  return GLOBAL_FALLBACK;
}

/**
 * Batch variant — resolves codes for many line items with a single DB round-trip.
 * Returns a Map keyed by line-item id (or undefined if the caller didn't supply one).
 */
export async function resolveAccountCodes(
  integrationId: string,
  lineItems: Array<{
    id?: string;
    category?: string | null;
    xeroAccountCode?: string | null;
  }>,
): Promise<Map<string | undefined, ResolvedAccountCode>> {
  const cache = await loadMappings(integrationId);
  const result = new Map<string | undefined, ResolvedAccountCode>();

  for (const item of lineItems) {
    if (item.xeroAccountCode && isValidXeroAccountCode(item.xeroAccountCode)) {
      result.set(item.id, {
        accountCode: item.xeroAccountCode,
        taxType: "OUTPUT",
      });
      continue;
    }

    const raw = item.category?.trim() ?? null;

    // Exact raw, then case-insensitive — supports arbitrary custom categories
    if (raw && cache.byRawCategory.has(raw)) {
      result.set(item.id, cache.byRawCategory.get(raw)!);
      continue;
    }
    if (raw && cache.byLowerCategory.has(raw.toLowerCase())) {
      result.set(item.id, cache.byLowerCategory.get(raw.toLowerCase())!);
      continue;
    }

    const normalized = normalizeCategory(raw);

    if (normalized && cache.byCanonical.has(normalized)) {
      result.set(item.id, cache.byCanonical.get(normalized)!);
      continue;
    }

    if (cache.defaultOverride) {
      result.set(item.id, cache.defaultOverride);
      continue;
    }

    if (normalized) {
      result.set(item.id, {
        accountCode: DEFAULT_CODES[normalized],
        taxType: "OUTPUT",
      });
      continue;
    }

    result.set(item.id, GLOBAL_FALLBACK);
  }

  return result;
}
