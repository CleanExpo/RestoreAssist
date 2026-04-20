/**
 * RA-869: Unit tests for account-code-resolver.
 *
 * Covers:
 *  - 7-priority resolution chain (override → raw → lower → canonical → default → built-in → global)
 *  - Client-configured arbitrary categories (not in canonical 6)
 *  - Case-insensitive category matching
 *  - Format validation (3-digit, 4-digit, Xero GUID, invalid)
 *  - LRU + TTL cache behaviour
 *  - DB error degrades gracefully to built-in defaults
 *  - Batch resolver single DB round-trip
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    xeroAccountCodeMapping: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  resolveAccountCode,
  resolveAccountCodes,
  resolveAccountCodeForItemType,
  clearAccountCodeCache,
  isValidXeroAccountCode,
  normalizeCategory,
} from "../account-code-resolver";

const mockFindMany = prisma.xeroAccountCodeMapping.findMany as ReturnType<
  typeof vi.fn
>;

const INTEGRATION_A = "integ_a";
const INTEGRATION_B = "integ_b";

beforeEach(() => {
  vi.clearAllMocks();
  clearAccountCodeCache();
});

afterEach(() => {
  clearAccountCodeCache();
});

// ─── resolveAccountCode — single item ─────────────────────────────────────────

describe("resolveAccountCode", () => {
  it("returns explicit override when valid", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
      xeroAccountCodeOverride: "999",
    });

    expect(r).toEqual({ accountCode: "999", taxType: "OUTPUT" });
    // Override wins — no DB call needed
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("ignores explicit override when format invalid and falls through", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
      xeroAccountCodeOverride: "NOT_A_VALID_CODE",
    });

    expect(r).toEqual({ accountCode: "200", taxType: "OUTPUT" }); // built-in LABOUR
  });

  it("returns DB override for exact raw category match (client-custom category)", async () => {
    // Client adds their own non-canonical category
    mockFindMany.mockResolvedValue([
      {
        category: "Emergency Make-Safe",
        accountCode: "310",
        taxType: "OUTPUT",
      },
    ]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "Emergency Make-Safe",
    });

    expect(r).toEqual({ accountCode: "310", taxType: "OUTPUT" });
  });

  it("matches case-insensitively when no exact raw match exists", async () => {
    mockFindMany.mockResolvedValue([
      { category: "Labour", accountCode: "400", taxType: "OUTPUT" },
    ]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR", // canonical vs DB-stored "Labour"
    });

    expect(r).toEqual({ accountCode: "400", taxType: "OUTPUT" });
  });

  it("returns DB override for canonical category match", async () => {
    mockFindMany.mockResolvedValue([
      { category: "EQUIPMENT", accountCode: "610", taxType: "EXEMPTOUTPUT" },
    ]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "equipment", // lowercase → normalises to EQUIPMENT
    });

    expect(r).toEqual({ accountCode: "610", taxType: "EXEMPTOUTPUT" });
  });

  it("returns per-integration default (null-category row) when no category matches", async () => {
    mockFindMany.mockResolvedValue([
      { category: null, accountCode: "260", taxType: "OUTPUT" },
    ]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "some-unknown-category",
    });

    expect(r).toEqual({ accountCode: "260", taxType: "OUTPUT" });
  });

  it("returns built-in default (LABOUR→200) when category is canonical and no DB row", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
    });

    expect(r).toEqual({ accountCode: "200", taxType: "OUTPUT" });
  });

  it("returns all 6 canonical built-in defaults correctly", async () => {
    mockFindMany.mockResolvedValue([]);

    const expected: Array<[string, string]> = [
      ["LABOUR", "200"],
      ["EQUIPMENT", "201"],
      ["MATERIALS", "202"],
      ["SUBCONTRACTOR", "203"],
      ["PRELIMS", "204"],
      ["CONTENTS", "205"],
    ];

    for (const [category, expectedCode] of expected) {
      clearAccountCodeCache(); // force re-lookup — we're reusing the mock
      const r = await resolveAccountCode({
        integrationId: INTEGRATION_A,
        lineItemCategory: category,
      });
      expect(r.accountCode).toBe(expectedCode);
    }
  });

  it("returns global fallback (200 OUTPUT) for unrecognised category with no default override", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "WidgetPolishing",
    });

    expect(r).toEqual({ accountCode: "200", taxType: "OUTPUT" });
  });

  it("skips invalid stored codes and falls through to built-in", async () => {
    mockFindMany.mockResolvedValue([
      // Invalid — 2 digits, should be skipped with a warning
      { category: "LABOUR", accountCode: "XX", taxType: "OUTPUT" },
    ]);

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
    });

    expect(r).toEqual({ accountCode: "200", taxType: "OUTPUT" }); // built-in
  });

  it("degrades to built-in defaults when DB query throws", async () => {
    mockFindMany.mockRejectedValue(new Error("DB unavailable"));

    const r = await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "EQUIPMENT",
    });

    expect(r).toEqual({ accountCode: "201", taxType: "OUTPUT" });
  });
});

// ─── Cache behaviour ──────────────────────────────────────────────────────────

describe("cache", () => {
  it("caches mappings per integration — second call does not hit DB", async () => {
    mockFindMany.mockResolvedValue([
      { category: "LABOUR", accountCode: "400", taxType: "OUTPUT" },
    ]);

    await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
    });
    await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "EQUIPMENT",
    });

    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("separate integrations each hit DB once", async () => {
    mockFindMany.mockResolvedValue([]);

    await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
    });
    await resolveAccountCode({
      integrationId: INTEGRATION_B,
      lineItemCategory: "LABOUR",
    });

    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it("clearAccountCodeCache(id) forces re-fetch on next call", async () => {
    mockFindMany.mockResolvedValue([]);

    await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
    });
    clearAccountCodeCache(INTEGRATION_A);
    await resolveAccountCode({
      integrationId: INTEGRATION_A,
      lineItemCategory: "LABOUR",
    });

    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });
});

// ─── resolveAccountCodes — batch ──────────────────────────────────────────────

describe("resolveAccountCodes (batch)", () => {
  it("single DB round-trip for many line items", async () => {
    mockFindMany.mockResolvedValue([
      { category: "LABOUR", accountCode: "400", taxType: "OUTPUT" },
      { category: null, accountCode: "250", taxType: "OUTPUT" },
    ]);

    const result = await resolveAccountCodes(INTEGRATION_A, [
      { id: "1", category: "LABOUR" },
      { id: "2", category: "EQUIPMENT" },
      { id: "3", category: "Emergency Make-Safe" },
      { id: "4", category: null },
    ]);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(result.get("1")).toEqual({ accountCode: "400", taxType: "OUTPUT" }); // DB match
    expect(result.get("2")).toEqual({ accountCode: "250", taxType: "OUTPUT" }); // default override
    expect(result.get("3")).toEqual({ accountCode: "250", taxType: "OUTPUT" }); // default override
    expect(result.get("4")).toEqual({ accountCode: "250", taxType: "OUTPUT" }); // default override
  });

  it("per-item override takes precedence over all DB state", async () => {
    mockFindMany.mockResolvedValue([
      { category: "LABOUR", accountCode: "400", taxType: "OUTPUT" },
    ]);

    const result = await resolveAccountCodes(INTEGRATION_A, [
      { id: "a", category: "LABOUR", xeroAccountCode: "999" },
    ]);

    expect(result.get("a")).toEqual({
      accountCode: "999",
      taxType: "OUTPUT",
    });
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("isValidXeroAccountCode", () => {
  it("accepts 3-digit numeric codes", () => {
    expect(isValidXeroAccountCode("200")).toBe(true);
    expect(isValidXeroAccountCode("999")).toBe(true);
  });

  it("accepts 4-digit numeric codes", () => {
    expect(isValidXeroAccountCode("4010")).toBe(true);
  });

  it("accepts Xero GUIDs", () => {
    expect(isValidXeroAccountCode("297c2dc5-cc47-4afd-8ec8-74990b8761e9")).toBe(
      true,
    );
  });

  it("rejects other formats", () => {
    expect(isValidXeroAccountCode("20")).toBe(false);
    expect(isValidXeroAccountCode("abc")).toBe(false);
    expect(isValidXeroAccountCode("")).toBe(false);
    expect(isValidXeroAccountCode("200-A")).toBe(false);
  });
});

describe("normalizeCategory", () => {
  it("returns canonical categories unchanged", () => {
    expect(normalizeCategory("LABOUR")).toBe("LABOUR");
    expect(normalizeCategory("CONTENTS")).toBe("CONTENTS");
  });

  it("normalises common legacy names", () => {
    expect(normalizeCategory("Labour")).toBe("LABOUR");
    expect(normalizeCategory("labour")).toBe("LABOUR");
    expect(normalizeCategory("labor")).toBe("LABOUR"); // US spelling
    expect(normalizeCategory("Chemical")).toBe("MATERIALS");
    expect(normalizeCategory("preliminaries")).toBe("PRELIMS");
    expect(normalizeCategory("Subcontractors")).toBe("SUBCONTRACTOR");
  });

  it("returns null for unknown categories", () => {
    expect(normalizeCategory("Emergency Make-Safe")).toBeNull();
    expect(normalizeCategory("")).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
  });

  it("trims whitespace", () => {
    expect(normalizeCategory("  LABOUR  ")).toBe("LABOUR");
  });
});

// ─── RA-854: resolveAccountCodeForItemType ───────────────────────────────────

describe("resolveAccountCodeForItemType (RA-854)", () => {
  it("returns built-in XeroCategory default when no override configured", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCodeForItemType({
      integrationId: INTEGRATION_A,
      itemType: "mobilisation",
    });

    // LABOUR_OWN default is 400 / OUTPUT
    expect(r).toEqual({ accountCode: "400", taxType: "OUTPUT" });
  });

  it("uses INPUT tax type for pass-through third-party disbursements", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCodeForItemType({
      integrationId: INTEGRATION_A,
      itemType: "clearance_testing",
    });

    expect(r).toEqual({ accountCode: "406", taxType: "INPUT" });
  });

  it("uses NONE tax type for insurance excess (OUT_OF_SCOPE)", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCodeForItemType({
      integrationId: INTEGRATION_A,
      itemType: "insurance_excess",
    });

    expect(r).toEqual({ accountCode: "409", taxType: "NONE" });
  });

  it("prefers user-configured XeroCategory mapping over built-in default", async () => {
    mockFindMany.mockResolvedValue([
      { category: "LABOUR_OWN", accountCode: "450", taxType: "OUTPUT" },
    ]);

    const r = await resolveAccountCodeForItemType({
      integrationId: INTEGRATION_A,
      itemType: "mobilisation",
    });

    expect(r).toEqual({ accountCode: "450", taxType: "OUTPUT" });
  });

  it("explicit override wins over classification", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCodeForItemType({
      integrationId: INTEGRATION_A,
      itemType: "mobilisation",
      xeroAccountCodeOverride: "999",
    });

    expect(r).toEqual({ accountCode: "999", taxType: "OUTPUT" });
  });

  it("falls back to legacy coarse-category routing for unknown itemType (backward compat)", async () => {
    // Operator has only configured the old 6-category scheme
    mockFindMany.mockResolvedValue([
      { category: "Labour", accountCode: "210", taxType: "OUTPUT" },
    ]);

    const r = await resolveAccountCodeForItemType({
      integrationId: INTEGRATION_A,
      itemType: "totally_unknown_item",
      legacyCategory: "Labour",
    });

    expect(r).toEqual({ accountCode: "210", taxType: "OUTPUT" });
  });

  it("unknown itemType with no legacy mapping falls to global default", async () => {
    mockFindMany.mockResolvedValue([]);

    const r = await resolveAccountCodeForItemType({
      integrationId: INTEGRATION_A,
      itemType: "totally_unknown_item",
      legacyCategory: null,
    });

    // Global fallback
    expect(r).toEqual({ accountCode: "200", taxType: "OUTPUT" });
  });
});
