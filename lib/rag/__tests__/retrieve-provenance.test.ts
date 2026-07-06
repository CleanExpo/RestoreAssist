/**
 * RA-7000: provenance-aware retrieval split.
 *
 * retrieveForCitation must query ONLY authoritative standards; retrieveForReasoning
 * must query all tiers. The pgvector query and the embedding call are both mocked,
 * so no live DB or OpenAI key is required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: vi.fn() },
}));

vi.mock("../embed", () => ({
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

import { prisma } from "@/lib/prisma";
import {
  retrieveForCitation,
  retrieveForReasoning,
  retrieveChunks,
} from "../retrieve";

const queryRawUnsafe = (
  prisma as unknown as { $queryRawUnsafe: ReturnType<typeof vi.fn> }
).$queryRawUnsafe;

const AUTHORITATIVE_ROW = {
  id: "c1",
  standard: "S500",
  edition: "2021",
  section: "§7.1",
  heading: "Category 2 Water",
  content: "Authoritative standards text.",
  provenance: "AUTHORITATIVE_STANDARD" as const,
  jurisdiction: "AU",
  similarity: 0.92,
};

const KNOWLEDGE_ROW = {
  ...AUTHORITATIVE_ROW,
  id: "c2",
  content: "Supporting knowledge text.",
  provenance: "KNOWLEDGE" as const,
};

beforeEach(() => {
  queryRawUnsafe.mockReset();
});

describe("retrieveForCitation", () => {
  it("filters the SQL to provenance = AUTHORITATIVE_STANDARD (excludes KNOWLEDGE)", async () => {
    // The DB would only ever return authoritative rows given the filter; assert
    // the filter is actually applied so a KNOWLEDGE row can never be returned.
    queryRawUnsafe.mockResolvedValue([AUTHORITATIVE_ROW]);

    const results = await retrieveForCitation("cat 2 water");

    const [sql, ...values] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('provenance = $2::"ChunkProvenance"');
    expect(values).toContain("AUTHORITATIVE_STANDARD");
    expect(
      results.every((r) => r.provenance === "AUTHORITATIVE_STANDARD"),
    ).toBe(true);
    // Each result carries what a citation needs.
    expect(results[0]).toMatchObject({
      standard: "S500",
      edition: "2021",
      section: "§7.1",
      jurisdiction: "AU",
    });
  });
});

describe("retrieveForReasoning", () => {
  it("does NOT filter by provenance (includes KNOWLEDGE + authoritative)", async () => {
    queryRawUnsafe.mockResolvedValue([AUTHORITATIVE_ROW, KNOWLEDGE_ROW]);

    const results = await retrieveForReasoning("cat 2 water");

    const [sql] = queryRawUnsafe.mock.calls[0];
    expect(sql).not.toContain("ChunkProvenance");
    const provenances = results.map((r) => r.provenance);
    expect(provenances).toContain("AUTHORITATIVE_STANDARD");
    expect(provenances).toContain("KNOWLEDGE");
  });

  it("applies optional standard + jurisdiction filters as bind params", async () => {
    queryRawUnsafe.mockResolvedValue([]);

    await retrieveForReasoning("q", {
      standard: "S520",
      jurisdiction: "NZ",
      k: 3,
    });

    const [sql, ...values] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("standard = $2");
    expect(sql).toContain("jurisdiction = $3");
    expect(values).toContain("S520");
    expect(values).toContain("NZ");
    expect(values).toContain(3);
  });
});

describe("retrieveChunks (legacy, all tiers)", () => {
  it("does not apply a provenance filter", async () => {
    queryRawUnsafe.mockResolvedValue([AUTHORITATIVE_ROW, KNOWLEDGE_ROW]);

    const results = await retrieveChunks("q", 5);

    const [sql] = queryRawUnsafe.mock.calls[0];
    expect(sql).not.toContain("ChunkProvenance");
    expect(results).toHaveLength(2);
  });
});
