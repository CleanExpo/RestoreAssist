import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const claimAnalysisFindFirst = vi.fn();
const downloadDriveFile = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimAnalysis: {
      findFirst: (...args: unknown[]) => claimAnalysisFindFirst(...args),
    },
  },
}));
vi.mock("@/lib/google-drive", () => ({
  downloadDriveFile: (...args: unknown[]) => downloadDriveFile(...args),
}));

import { GET } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/claims/document/file-123");
}
const ctx = { params: Promise.resolve({ fileId: "file-123" }) };

beforeEach(() => {
  getServerSession.mockReset();
  claimAnalysisFindFirst.mockReset();
  downloadDriveFile.mockReset();
});

describe("GET /api/claims/document/[fileId]", () => {
  it("returns 401 when unauthenticated and never touches Drive", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest(), ctx);
    expect(res.status).toBe(401);
    expect(downloadDriveFile).not.toHaveBeenCalled();
  });

  it("returns 404 when the fileId belongs to another user (no cross-tenant download)", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-A" } });
    // The row exists only in user-B's batch; the query filters on the caller.
    claimAnalysisFindFirst.mockImplementation(
      async (args: { where: { batch?: { userId?: string } } }) =>
        args.where.batch?.userId === "user-B" ? { id: "analysis-1" } : null,
    );
    const res = await GET(makeRequest(), ctx);
    expect(res.status).toBe(404);
    expect(downloadDriveFile).not.toHaveBeenCalled();
    expect(claimAnalysisFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { googleDriveFileId: "file-123", batch: { userId: "user-A" } },
      }),
    );
  });

  it("returns 404 when no claim analysis owns the fileId", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-A" } });
    claimAnalysisFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), ctx);
    expect(res.status).toBe(404);
    expect(downloadDriveFile).not.toHaveBeenCalled();
  });

  it("serves the PDF with a private, no-store cache header for the owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-A" } });
    claimAnalysisFindFirst.mockResolvedValue({ id: "analysis-1" });
    downloadDriveFile.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.4 test"),
      mimeType: "application/pdf",
    });
    const res = await GET(makeRequest(), ctx);
    expect(res.status).toBe(200);
    expect(downloadDriveFile).toHaveBeenCalledWith("file-123");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
