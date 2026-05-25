import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const queryRaw = vi.fn();
const executeRaw = vi.fn();
const embedText = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
  },
}));
vi.mock("@/lib/ai/embeddings", () => ({
  buildJobEmbeddingText: vi.fn(() => "embedding text"),
  embedText: (...args: unknown[]) => embedText(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  queryRaw.mockReset();
  executeRaw.mockReset();
  embedText.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_user", role: "ADMIN" },
  });
});

function postRequest() {
  return new NextRequest("http://localhost/api/admin/vectorise", {
    method: "POST",
    body: JSON.stringify({ provider: "hash-fallback", batchSize: 1 }),
  });
}

describe("POST /api/admin/vectorise", () => {
  it("does not expose per-job embedding exception details", async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: BigInt(1) }])
      .mockResolvedValueOnce([
        {
          id: "job_1",
          tenantId: "admin_user",
          claimType: "water",
          waterCategory: null,
          waterClass: null,
          suburb: "Brisbane",
          state: "QLD",
          description: "Water damage",
          jobName: "Job 1",
          customerName: "Customer",
          totalExTax: 100,
          itemCount: 1,
          equipmentCount: 1,
          customFields: null,
          embeddedAt: null,
        },
      ]);
    embedText.mockRejectedValueOnce(
      new Error("provider leaked stack trace with key sk-secret"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errors).toEqual(["job_1: Embedding failed"]);
  });
});
