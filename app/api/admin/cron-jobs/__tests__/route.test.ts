import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const fetchMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  fetchMock.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_user", role: "ADMIN" },
  });
  vi.stubGlobal("fetch", fetchMock);
});

function postRequest(jobId = "cleanup") {
  return new NextRequest("http://localhost/api/admin/cron-jobs", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
}

describe("POST /api/admin/cron-jobs", () => {
  it("does not expose cron fetch exception details", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("ECONNREFUSED http://internal-host/secret"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: "Cron job trigger failed",
    });
  });
});
