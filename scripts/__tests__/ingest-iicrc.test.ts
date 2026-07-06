/**
 * RA-6934: Unit tests for the hardened scripts/ingest-iicrc.ts ingestion path.
 *
 * All external dependencies (OpenAI embedding API, PrismaClient, filesystem)
 * are mocked or exercised via pure functions — no live key, DB, or Drive
 * access is required to run these.
 */

import { describe, it, expect, vi } from "vitest";
import {
  chunkText,
  extractSection,
  buildContentHash,
  validateIngestEnv,
  assertEmbeddingShape,
  upsertChunk,
  parseArgs,
  parseProvenance,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  MIN_CHUNK_LENGTH,
  EXPECTED_EMBEDDING_DIMENSIONS,
  type IicrcChunkPrisma,
} from "../ingest-iicrc.js";

const FIXED_VECTOR = Array.from(
  { length: EXPECTED_EMBEDDING_DIMENSIONS },
  (_, i) => i / EXPECTED_EMBEDDING_DIMENSIONS,
);

// ─── chunkText ────────────────────────────────────────────────────────────────

describe("chunkText", () => {
  it("splits text into overlapping windows of CHUNK_SIZE with CHUNK_OVERLAP", () => {
    const text = "a".repeat(1200);
    const chunks = chunkText(text);

    // Step size is CHUNK_SIZE - CHUNK_OVERLAP; verify windows tile the input
    const step = CHUNK_SIZE - CHUNK_OVERLAP;
    const expectedWindows = Math.ceil(text.length / step);
    expect(chunks.length).toBe(expectedWindows);
    expect(chunks[0].length).toBe(CHUNK_SIZE);
  });

  it("filters out chunks at or below MIN_CHUNK_LENGTH after trimming", () => {
    const chunks = chunkText("   short   ");
    expect(chunks).toEqual([]);
  });

  it("keeps chunks longer than MIN_CHUNK_LENGTH", () => {
    const longEnough = "x".repeat(MIN_CHUNK_LENGTH + 1);
    const chunks = chunkText(longEnough);
    expect(chunks).toEqual([longEnough]);
  });
});

// ─── extractSection ───────────────────────────────────────────────────────────

describe("extractSection", () => {
  it("extracts a § section reference and normalises whitespace", () => {
    const { section } = extractSection("See § 12.3.3 for containment.");
    expect(section).toBe("§12.3.3");
  });

  it("falls back to 'General' when no § reference is present", () => {
    const { section } = extractSection("No section marker here at all.");
    expect(section).toBe("General");
  });

  it("extracts a heading-like line when present", () => {
    const chunk = "Damage Classification\nBody text follows below the heading.";
    const { heading } = extractSection(chunk);
    expect(heading).toBe("Damage Classification");
  });
});

// ─── buildContentHash ─────────────────────────────────────────────────────────

describe("buildContentHash", () => {
  it("is deterministic for the same (standard, edition, content)", () => {
    const h1 = buildContentHash("S500", "2021", "identical text");
    const h2 = buildContentHash("S500", "2021", "identical text");
    expect(h1).toBe(h2);
  });

  it("differs across standards for identical boilerplate content", () => {
    // Two different standards sharing an identical cover-page/boilerplate
    // passage must NOT collide under the (globally unique) contentHash —
    // otherwise the second document's chunk is silently dropped.
    const h1 = buildContentHash("S500", "2021", "IICRC copyright boilerplate");
    const h2 = buildContentHash("S520", "2024", "IICRC copyright boilerplate");
    expect(h1).not.toBe(h2);
  });

  it("differs across editions of the same standard", () => {
    const h1 = buildContentHash("S500", "2021", "same text");
    const h2 = buildContentHash("S500", "2015", "same text");
    expect(h1).not.toBe(h2);
  });
});

// ─── validateIngestEnv ────────────────────────────────────────────────────────

describe("validateIngestEnv", () => {
  it("throws naming every missing variable when both are absent", () => {
    expect(() => validateIngestEnv({})).toThrowError(/OPENAI_API_KEY/);
    expect(() => validateIngestEnv({})).toThrowError(/DATABASE_URL/);
  });

  it("throws when only OPENAI_API_KEY is missing", () => {
    expect(() =>
      validateIngestEnv({ DATABASE_URL: "postgres://x" }),
    ).toThrowError(/OPENAI_API_KEY/);
  });

  it("throws when only DATABASE_URL is missing", () => {
    expect(() => validateIngestEnv({ OPENAI_API_KEY: "sk-test" })).toThrowError(
      /DATABASE_URL/,
    );
  });

  it("treats a blank/whitespace-only value as missing", () => {
    expect(() =>
      validateIngestEnv({
        OPENAI_API_KEY: "   ",
        DATABASE_URL: "postgres://x",
      }),
    ).toThrowError(/OPENAI_API_KEY/);
  });

  it("does not throw when both are present", () => {
    expect(() =>
      validateIngestEnv({
        OPENAI_API_KEY: "sk-test",
        DATABASE_URL: "postgres://x",
      }),
    ).not.toThrow();
  });
});

// ─── assertEmbeddingShape ─────────────────────────────────────────────────────

describe("assertEmbeddingShape", () => {
  it("passes for a correctly-shaped batch", () => {
    expect(() =>
      assertEmbeddingShape([FIXED_VECTOR, FIXED_VECTOR], 2),
    ).not.toThrow();
  });

  it("throws when the provider returns fewer vectors than texts requested", () => {
    expect(() => assertEmbeddingShape([FIXED_VECTOR], 2)).toThrowError(
      /returned 1 vectors for a batch of 2/,
    );
  });

  it("throws when a vector has the wrong dimension", () => {
    const wrongDim = FIXED_VECTOR.slice(0, 10);
    expect(() => assertEmbeddingShape([wrongDim], 1)).toThrowError(
      /has 10 dimensions, expected 1536/,
    );
  });
});

// ─── upsertChunk ──────────────────────────────────────────────────────────────

describe("upsertChunk", () => {
  const row = {
    standard: "S500",
    edition: "2021",
    section: "§7.1",
    heading: "Category 2 Water",
    content: "Category 2 water originates from a source with contamination.",
    contentHash: buildContentHash("S500", "2021", "content-for-upsert-test"),
    pageNumber: 3,
    embedding: FIXED_VECTOR,
    provenance: "AUTHORITATIVE_STANDARD" as const,
    jurisdiction: "AU",
  };

  it("reports 'inserted' when $executeRawUnsafe affects 1 row", async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(1);
    const mockPrisma: IicrcChunkPrisma = {
      $executeRawUnsafe: executeRawUnsafe,
    };

    const result = await upsertChunk(mockPrisma, row);

    expect(result).toBe("inserted");
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, ...values] = executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('INSERT INTO "IicrcChunk"');
    expect(sql).toContain("ON CONFLICT");
    expect(values).toContain(row.standard);
    expect(values).toContain(row.contentHash);
    // Vector literal is passed as a bind param, not interpolated into SQL text.
    expect(values.some((v) => v === `[${FIXED_VECTOR.join(",")}]`)).toBe(true);
  });

  it("RA-7000: writes provenance + jurisdiction as bind params", async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(1);
    const mockPrisma: IicrcChunkPrisma = {
      $executeRawUnsafe: executeRawUnsafe,
    };

    await upsertChunk(mockPrisma, {
      ...row,
      provenance: "KNOWLEDGE",
      jurisdiction: "NZ",
    });

    const [sql, ...values] = executeRawUnsafe.mock.calls[0];
    // Columns present in the INSERT, and the enum is cast, not interpolated.
    expect(sql).toContain("provenance");
    expect(sql).toContain("jurisdiction");
    expect(sql).toContain('::"ChunkProvenance"');
    expect(values).toContain("KNOWLEDGE");
    expect(values).toContain("NZ");
  });

  it("reports 'skipped' (idempotent) when $executeRawUnsafe affects 0 rows", async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const mockPrisma: IicrcChunkPrisma = {
      $executeRawUnsafe: executeRawUnsafe,
    };

    const result = await upsertChunk(mockPrisma, row);

    expect(result).toBe("skipped");
  });

  it("re-running the same row twice is idempotent: insert then skip", async () => {
    // Simulates a re-run: first call inserts, second call (same contentHash)
    // hits ON CONFLICT DO NOTHING and affects 0 rows.
    const executeRawUnsafe = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const mockPrisma: IicrcChunkPrisma = {
      $executeRawUnsafe: executeRawUnsafe,
    };

    const first = await upsertChunk(mockPrisma, row);
    const second = await upsertChunk(mockPrisma, row);

    expect(first).toBe("inserted");
    expect(second).toBe("skipped");
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("uses defaults when no flags are given (authoritative-standard / AU)", () => {
    expect(parseArgs([])).toEqual({
      dir: "./iicrc-pdfs",
      standard: "S500",
      edition: "2025",
      provenance: "AUTHORITATIVE_STANDARD",
      jurisdiction: "AU",
    });
  });

  it("reads --dir, --standard, --edition flags", () => {
    expect(
      parseArgs(["--dir", "./out", "--standard", "S520", "--edition", "2024"]),
    ).toEqual({
      dir: "./out",
      standard: "S520",
      edition: "2024",
      provenance: "AUTHORITATIVE_STANDARD",
      jurisdiction: "AU",
    });
  });

  it("RA-7000: reads --provenance and --jurisdiction flags", () => {
    expect(
      parseArgs(["--provenance", "knowledge", "--jurisdiction", "NZ"]),
    ).toMatchObject({ provenance: "KNOWLEDGE", jurisdiction: "NZ" });
  });
});

// ─── parseProvenance ──────────────────────────────────────────────────────────

describe("parseProvenance", () => {
  it("accepts the friendly hyphenated form case-insensitively", () => {
    expect(parseProvenance("authoritative-standard")).toBe(
      "AUTHORITATIVE_STANDARD",
    );
    expect(parseProvenance("Knowledge")).toBe("KNOWLEDGE");
  });

  it("accepts the raw enum literal", () => {
    expect(parseProvenance("AUTHORITATIVE_STANDARD")).toBe(
      "AUTHORITATIVE_STANDARD",
    );
  });

  it("throws (fails loud) on an unknown value rather than mis-tagging", () => {
    expect(() => parseProvenance("standard")).toThrowError(
      /Invalid --provenance/,
    );
  });
});
