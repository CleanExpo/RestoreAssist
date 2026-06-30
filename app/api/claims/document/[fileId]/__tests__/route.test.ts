import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const claimAnalysisFindUnique = vi.fn();
const downloadDriveFile = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimAnalysis: {
      findUnique: (...args: unknown[]) => claimAnalysisFindUnique(...args),
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
  claimAnalysisFindUnique.mockReset();
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
    claimAnalysisFindUnique.mockResolvedValue({ batch: { userId: "user-B" } });
    const res = await GET(makeRequest(), ctx);
    expect(res.status).toBe(404);
    expect(downloadDriveFile).not.toHaveBeenCalled();
  });

  it("returns 404 when no claim analysis owns the fileId", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-A" } });
    claimAnalysisFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), ctx);
    expect(res.status).toBe(404);
    expect(downloadDriveFile).not.toHaveBeenCalled();
  });

  it("serves the PDF with a private, no-store cache header for the owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-A" } });
    claimAnalysisFindUnique.mockResolvedValue({ batch: { userId: "user-A" } });
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
