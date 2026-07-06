/**
 * RA-6934 — operator standards-ingest route: auth gate + body validation.
 * The happy-path pipeline (chunk/embed/upsert) is covered by
 * scripts/__tests__ against the shared pure functions; here we verify the
 * route's own responsibilities: fail-closed bearer auth and schema rejection.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { upsertChunkMock, embedBatchMock } = vi.hoisted(() => ({
  upsertChunkMock: vi.fn(),
  embedBatchMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rag/embed", () => ({ embedBatch: embedBatchMock }));
vi.mock("@/scripts/ingest-iicrc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/scripts/ingest-iicrc")>();
  return { ...actual, upsertChunk: upsertChunkMock };
});

import { POST } from "@/app/api/cron/ingest-standards/route";

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
