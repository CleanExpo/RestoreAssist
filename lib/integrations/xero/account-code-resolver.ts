/**
 * RA-869: Xero Account Code Resolver
 *
 * Resolves the correct Xero account code and tax type for each line item
 * on an invoice before syncing to Xero. Uses per-integration mappings stored
 * in the XeroAccountCodeMapping table (RA-848 schema migration).
 *
 * Resolution priority (highest to lowest):
 *   1. InvoiceLineItem.xeroAccountCode — explicit per-item override
 *   2. XeroAccountCodeMapping matching the line item's category
 *   3. XeroAccountCodeMapping with category = null (default fallback)
 *   4. Built-in defaults (hardcoded safe values for Australian GST)
 *
 * Never throws — always returns a valid account code / tax type pair.
 * Failure to resolve is not a reason to block an invoice sync.
 *
 * NOTE: Requires RA-848 migration (`npx prisma migrate dev --name billing_v2_xero_account_mappings`)
 * to be run before XeroAccountCodeMapping queries will work.
 */

import { prisma } from "@/lib/prisma";

export interface ResolvedAccountCode {
  accountCode: string;
  taxType: string;
}

/**
 * Built-in defaults by category — used when no mapping row exists.
 * Account codes are illustrative Xero defaults for Australian businesses.
 * Operators should configure their own via XeroAccountCodeMapping to match
 * their actual chart of accounts.
 */
const DEFAULT_CODE_BY_CATEGORY: Record<string, ResolvedAccountCode> = {
  Labour: { accountCode: "200", taxType: "OUTPUT" },
  labor: { accountCode: "200", taxType: "OUTPUT" },
  Equipment: { accountCode: "630", taxType: "OUTPUT" },
  equipment: { accountCode: "630", taxType: "OUTPUT" },
  Materials: { accountCode: "300", taxType: "OUTPUT" },
  materials: { accountCode: "300", taxType: "OUTPUT" },
  Chemical: { accountCode: "300", taxType: "OUTPUT" },
  chemical: { accountCode: "300", taxType: "OUTPUT" },
  Subcontractor: { accountCode: "489", taxType: "OUTPUT" },
  subcontractor: { accountCode: "489", taxType: "OUTPUT" },
  Travel: { accountCode: "493", taxType: "OUTPUT" },
  travel: { accountCode: "493", taxType: "OUTPUT" },
  Disposal: { accountCode: "461", taxType: "OUTPUT" },
  disposal: { accountCode: "461", taxType: "OUTPUT" },
};

const GLOBAL_DEFAULT: ResolvedAccountCode = {
  accountCode: "200", // General income — safe fallback
  taxType: "OUTPUT",
};

/**
 * Resolve account code and tax type for a single line item.
 *
 * @param integrationId  Xero Integration row ID (used to scope mapping lookup)
 * @param category       InvoiceLineItem.category (may be null)
 * @param xeroAccountCodeOverride  InvoiceLineItem.xeroAccountCode (may be null — explicit override)
 */
export async function resolveAccountCode(
  integrationId: string,
  category: string | null | undefined,
  xeroAccountCodeOverride?: string | null,
): Promise<ResolvedAccountCode> {
  // Priority 1: explicit per-item override
  if (xeroAccountCodeOverride) {
    return { accountCode: xeroAccountCodeOverride, taxType: "OUTPUT" };
  }

  // Priority 2 + 3: DB lookup — category-specific first, then default (null category)
  try {
    const mappings = await prisma.xeroAccountCodeMapping.findMany({
      where: {
        integrationId,
        category: category
          ? { in: [category, null as unknown as string] }
          : null,
      },
      orderBy: [
        // category-specific rows (non-null) sort before null (default) rows
        { category: "asc" },
      ],
    });

    // Prefer exact category match over null-category default
    const exact = mappings.find(
      (m) => m.category !== null && m.category === category,
    );
    const fallback = mappings.find((m) => m.category === null);
    const match = exact ?? fallback;

    if (match) {
      return { accountCode: match.accountCode, taxType: match.taxType };
    }
  } catch (err) {
    // DB error (e.g. migration not yet run) — degrade to built-in defaults
    console.warn(
      `[Xero AccountCodeResolver] DB lookup failed for integration ${integrationId} — using built-in defaults. Error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Priority 4: built-in defaults
  if (category) {
    const builtIn = DEFAULT_CODE_BY_CATEGORY[category];
    if (builtIn) return builtIn;

    // Case-insensitive match on built-in defaults
    const caseInsensitive = Object.entries(DEFAULT_CODE_BY_CATEGORY).find(
      ([key]) => key.toLowerCase() === category.toLowerCase(),
    );
    if (caseInsensitive) return caseInsensitive[1];
  }

  return GLOBAL_DEFAULT;
}

/**
 * Resolve account codes for a batch of line items in a single DB round-trip.
 * Fetches all mappings for the integration once, then resolves each item locally.
 *
 * @param integrationId  Xero Integration row ID
 * @param lineItems      Array of { id, category, xeroAccountCode } — minimal projection
 */
export async function resolveAccountCodes(
  integrationId: string,
  lineItems: Array<{
    id?: string;
    category?: string | null;
    xeroAccountCode?: string | null;
  }>,
): Promise<Map<string | undefined, ResolvedAccountCode>> {
  const result = new Map<string | undefined, ResolvedAccountCode>();

  // Fetch all mappings for this integration once
  let mappings: Array<{
    category: string | null;
    accountCode: string;
    taxType: string;
  }> = [];

  try {
    mappings = await prisma.xeroAccountCodeMapping.findMany({
      where: { integrationId },
      select: { category: true, accountCode: true, taxType: true },
    });
  } catch (err) {
    console.warn(
      `[Xero AccountCodeResolver] Batch DB lookup failed — using built-in defaults. Error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Build lookup maps from DB results
  const categoryMap = new Map<string, ResolvedAccountCode>();
  let defaultMapping: ResolvedAccountCode | undefined;

  for (const m of mappings) {
    const resolved: ResolvedAccountCode = {
      accountCode: m.accountCode,
      taxType: m.taxType,
    };
    if (m.category === null) {
      defaultMapping = resolved;
    } else {
      categoryMap.set(m.category, resolved);
    }
  }

  // Resolve each line item
  for (const item of lineItems) {
    // Priority 1: explicit override
    if (item.xeroAccountCode) {
      result.set(item.id, {
        accountCode: item.xeroAccountCode,
        taxType: "OUTPUT",
      });
      continue;
    }

    const cat = item.category ?? null;

    // Priority 2: exact category match from DB
    if (cat && categoryMap.has(cat)) {
      result.set(item.id, categoryMap.get(cat)!);
      continue;
    }

    // Priority 3: null (default) mapping from DB
    if (defaultMapping) {
      result.set(item.id, defaultMapping);
      continue;
    }

    // Priority 4: built-in defaults
    if (cat) {
      const builtIn =
        DEFAULT_CODE_BY_CATEGORY[cat] ??
        Object.entries(DEFAULT_CODE_BY_CATEGORY).find(
          ([key]) => key.toLowerCase() === cat.toLowerCase(),
        )?.[1];
      if (builtIn) {
        result.set(item.id, builtIn);
        continue;
      }
    }

    result.set(item.id, GLOBAL_DEFAULT);
  }

  return result;
}
