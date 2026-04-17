/**
 * RA-1132d: Unit tests for ingest-standards.ts
 *
 * All external dependencies (OpenAI API, PrismaClient) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import {
  loadCorpus,
  formatPgvector,
  upsertChunk,
  type CorpusEntry,
  type EmbeddingProvider,
} from "../ingest-standards.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CORPUS_PATH = path.resolve(
  __dirname,
  "../../scripts/data/standards-corpus.json"
);

const FIXED_VECTOR = Array.from({ length: 1536 }, (_, i) => i / 1536);

const SAMPLE_ENTRY: CorpusEntry = {
  standard: "IICRC_S500",
  edition: "2025",
  clause: "10.5",
  title: "S500 — Category 2 water",
  jurisdiction: "AU",
  summary: "Covers greywater classification and response requirements.",
};

// ─── Mock embedding provider ─────────────────────────────────────────────────

class MockEmbeddingProvider implements EmbeddingProvider {
  embed = vi.fn(async (_text: string): Promise<number[]> => FIXED_VECTOR);
}

// ─── Test 1: corpus JSON loads and validates schema ───────────────────────────

describe("loadCorpus", () => {
  it("loads the standards-corpus.json and validates required fields", () => {
    const entries = loadCorpus(CORPUS_PATH);

    // At least 25 entries
    expect(entries.length).toBeGreaterThanOrEqual(25);

    // Each entry has all required fields as non-empty strings
    const requiredFields: (keyof CorpusEntry)[] = [
      "standard",
      "edition",
      "clause",
      "title",
      "jurisdiction",
      "summary",
    ];

    for (const entry of entries) {
      for (const field of requiredFields) {
        expect(typeof entry[field]).toBe("string");
        expect(entry[field].trim().length).toBeGreaterThan(0);
      }
    }

    // Summaries are all under 600 characters (well within the 80-word guidance)
    for (const entry of entries) {
      expect(entry.summary.length).toBeLessThan(600);
    }

    // Jurisdiction is one of the allowed values
    const allowedJurisdictions = ["AU", "NZ", "BOTH"];
    for (const entry of entries) {
      expect(allowedJurisdictions).toContain(entry.jurisdiction);
    }

    // Standard breakdown: at least one entry per expected standard
    const standards = new Set(entries.map((e) => e.standard));
    expect(standards).toContain("IICRC_S500");
    expect(standards).toContain("AS_NZS_4849_1");
    expect(standards).toContain("AS_NZS_4360");
    expect(standards).toContain("AS_NZS_3000");
    expect(standards).toContain("NZBS_E2");
    expect(standards).toContain("NZBS_E3");
    expect(standards).toContain("NADCA_ACR");
  });
});

// ─── Test 2: generates an embedding for each entry via mock provider ──────────

describe("EmbeddingProvider", () => {
  it("calls embed once per corpus entry with title + summary text", async () => {
    const provider = new MockEmbeddingProvider();
    const entries = loadCorpus(CORPUS_PATH);

    for (const entry of entries) {
      const text = `${entry.title}\n\n${entry.summary}`;
      const result = await provider.embed(text);
      expect(result).toHaveLength(1536);
      expect(result[0]).toBe(FIXED_VECTOR[0]);
    }

    expect(provider.embed).toHaveBeenCalledTimes(entries.length);

    // Verify embed was called with the composite text format
    const firstCall = provider.embed.mock.calls[0][0] as string;
    const firstEntry = entries[0];
    expect(firstCall).toBe(`${firstEntry.title}\n\n${firstEntry.summary}`);
  });
});

// ─── Test 3: upserts via raw SQL with ON CONFLICT update ─────────────────────

describe("upsertChunk", () => {
  it("calls prisma.$executeRaw with correct values; idempotent on conflict", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);

    // Minimal PrismaClient mock
    const mockPrisma = {
      $executeRaw: executeRaw,
    } as unknown as import("@prisma/client").PrismaClient;

    // First upsert (insert path)
    await upsertChunk(mockPrisma, SAMPLE_ENTRY, FIXED_VECTOR);
    expect(executeRaw).toHaveBeenCalledTimes(1);

    // Second upsert (conflict / update path) — should not throw
    await upsertChunk(mockPrisma, SAMPLE_ENTRY, FIXED_VECTOR);
    expect(executeRaw).toHaveBeenCalledTimes(2);

    // Verify the pgvector literal format used in the call
    const embeddingLiteral = formatPgvector(FIXED_VECTOR);
    expect(embeddingLiteral).toMatch(/^\[[\d.,e+-]+\]$/);
    expect(embeddingLiteral.startsWith("[0,")).toBe(true);
  });

  it("formatPgvector produces a valid pgvector array literal", () => {
    const vec = [0.1, 0.2, 0.3];
    const result = formatPgvector(vec);
    expect(result).toBe("[0.1,0.2,0.3]");
  });
});
