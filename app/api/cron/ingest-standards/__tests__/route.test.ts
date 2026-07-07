/**
 * RA-6934 — operator standards-ingest route: auth gate + body validation.
 * The happy-path pipeline (chunk/embed/upsert) is covered by
 * scripts/__tests__ against the shared pure functions; here we verify the
 * route's own responsibilities: fail-closed bearer auth and schema rejection.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  upsertChunkMock,
  embedBatchMock,
  queryRawMock,
  retrieveForCitationMock,
  retrieveForReasoningMock,
} = vi.hoisted(() => ({
  upsertChunkMock: vi.fn(),
  embedBatchMock: vi.fn(),
  queryRawMock: vi.fn(),
  retrieveForCitationMock: vi.fn(),
  retrieveForReasoningMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRawMock } }));
vi.mock("@/lib/rag/embed", () => ({ embedBatch: embedBatchMock }));
vi.mock("@/lib/rag/retrieve", () => ({
  retrieveForCitation: retrieveForCitationMock,
  retrieveForReasoning: retrieveForReasoningMock,
}));
vi.mock("@/scripts/ingest-iicrc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/scripts/ingest-iicrc")>();
  return { ...actual, upsertChunk: upsertChunkMock };
});

import { GET, POST } from "@/app/api/cron/ingest-standards/route";

function buildRequest(
  authHeader: string | null,
  body: unknown = {},
): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost/api/cron/ingest-standards", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  standard: "S500",
  edition: "2021",
  files: [{ name: "007 - Principles.txt", text: "x".repeat(600) }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STANDARDS_INGEST_TOKEN = "test-ingest-token";
  embedBatchMock.mockImplementation(async (texts: string[]) =>
    texts.map(() => Array(1536).fill(0.1)),
  );
  upsertChunkMock.mockResolvedValue("inserted");
});

describe("POST /api/cron/ingest-standards", () => {
  it("fails closed when STANDARDS_INGEST_TOKEN is unset", async () => {
    delete process.env.STANDARDS_INGEST_TOKEN;
    const res = await POST(buildRequest("Bearer ", VALID_BODY));
    expect(res.status).toBe(401);
    expect(upsertChunkMock).not.toHaveBeenCalled();
  });

  it("rejects a missing bearer", async () => {
    const res = await POST(buildRequest(null, VALID_BODY));
    expect(res.status).toBe(401);
    expect(upsertChunkMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer", async () => {
    const res = await POST(buildRequest("Bearer wrong", VALID_BODY));
    expect(res.status).toBe(401);
    expect(upsertChunkMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with 400", async () => {
    const res = await POST(
      buildRequest("Bearer test-ingest-token", { standard: "S500" }),
    );
    expect(res.status).toBe(400);
    expect(upsertChunkMock).not.toHaveBeenCalled();
  });

  it("ingests a valid body and reports the summary shape", async () => {
    const res = await POST(buildRequest("Bearer test-ingest-token", VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      standard: "S500",
      edition: "2021",
      filesProcessed: 1,
    });
    expect(json.chunksUpserted).toBeGreaterThan(0);
    expect(embedBatchMock).toHaveBeenCalled();
    expect(upsertChunkMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        standard: "S500",
        edition: "2021",
        provenance: "AUTHORITATIVE_STANDARD",
        jurisdiction: "AU",
      }),
    );
  });
});

function buildGetRequest(
  authHeader: string | null,
  search = "",
): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest(
    `http://localhost/api/cron/ingest-standards${search}`,
    { method: "GET", headers },
  );
}

const CHUNK = {
  id: "c1",
  edition: "2021",
  heading: "",
  content: "Category 3 water is grossly contaminated…",
};

describe("GET /api/cron/ingest-standards (health probe)", () => {
  it("rejects a missing bearer with 401", async () => {
    const res = await GET(buildGetRequest(null));
    expect(res.status).toBe(401);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns tiered chunk counts and a total for a valid bearer", async () => {
    queryRawMock.mockResolvedValue([
      { kind: "knowledge", provenance: "KNOWLEDGE", chunks: 31279 },
      { kind: "standard", provenance: "AUTHORITATIVE_STANDARD", chunks: 9438 },
    ]);
    const res = await GET(buildGetRequest("Bearer test-ingest-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(40717);
    expect(json.byTier).toHaveLength(2);
  });

  it("returns 500 without leaking details when the query throws", async () => {
    queryRawMock.mockRejectedValue(new Error("db down"));
    const res = await GET(buildGetRequest("Bearer test-ingest-token"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("does not run retrieval without a ?q= query", async () => {
    queryRawMock.mockResolvedValue([
      { kind: "standard", provenance: "AUTHORITATIVE_STANDARD", chunks: 9438 },
    ]);
    const json = await (await GET(buildGetRequest("Bearer test-ingest-token"))).json();
    expect(json.probe).toBeUndefined();
    expect(retrieveForCitationMock).not.toHaveBeenCalled();
  });

  it("with ?q=, probes both retrieval tiers the report generator uses", async () => {
    queryRawMock.mockResolvedValue([
      { kind: "standard", provenance: "AUTHORITATIVE_STANDARD", chunks: 9438 },
    ]);
    retrieveForCitationMock.mockResolvedValue([
      { ...CHUNK, standard: "S500", section: "§10.5.1", provenance: "AUTHORITATIVE_STANDARD", jurisdiction: "AU", similarity: 0.8231 },
    ]);
    retrieveForReasoningMock.mockResolvedValue([
      { ...CHUNK, standard: "CARSI-MOULDREMEDIATI", section: "", provenance: "KNOWLEDGE", jurisdiction: "AU", similarity: 0.77 },
    ]);

    const res = await GET(
      buildGetRequest("Bearer test-ingest-token", "?q=category+3+water"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // The report's citation tier: authoritative only, carries edition + section.
    expect(retrieveForCitationMock).toHaveBeenCalledWith("category 3 water", { k: 3 });
    expect(json.probe.query).toBe("category 3 water");
    expect(json.probe.citation[0]).toMatchObject({
      standard: "S500",
      section: "§10.5.1",
      provenance: "AUTHORITATIVE_STANDARD",
      similarity: 0.823,
    });
    // The reasoning tier can include KNOWLEDGE sources.
    expect(json.probe.reasoning[0].provenance).toBe("KNOWLEDGE");
    // Snippets are truncated, never full verbatim text.
    expect(json.probe.citation[0].snippet.length).toBeLessThanOrEqual(120);
  });
});
