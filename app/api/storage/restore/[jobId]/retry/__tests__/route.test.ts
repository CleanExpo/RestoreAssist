import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getServerSession,
  retryRestoreJob,
  db,
} = vi.hoisted(() => {
  const db = {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    storageRestoreJob: { findUnique: vi.fn() },
  };
  return {
    getServerSession: vi.fn(),
    retryRestoreJob: vi.fn(),
    db,
  };
});

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/queue/storage-restore", () => ({
  retryRestoreJob: (...a: unknown[]) => retryRestoreJob(...a),
}));
vi.mock("@/lib/api-errors", () => ({
  fromException: (_req: unknown, err: unknown) => {
    throw err;
  },
}));

import { POST } from "@/app/api/storage/restore/[jobId]/retry/route";

function req() {
  return new Request("http://x/api/storage/restore/job-1/retry", {
    method: "POST",
  }) as any;
}

beforeEach(() => {
  getServerSession.mockReset();
  retryRestoreJob.mockReset();
  db.user.findUnique.mockReset();
  db.organization.findUnique.mockReset();
  db.storageRestoreJob.findUnique.mockReset();
});

describe("POST /api/storage/restore/[jobId]/retry", () => {
  it("returns 401 when no session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the signed-in user is not the org owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
    db.organization.findUnique.mockResolvedValue({ ownerId: "someone-else" });
    const res = await POST(req(), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the job belongs to a different org (cross-org)", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
    db.organization.findUnique.mockResolvedValue({ ownerId: "owner" });
    db.storageRestoreJob.findUnique.mockResolvedValue({ orgId: "org-other" });
    const res = await POST(req(), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the job does not exist", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
    db.organization.findUnique.mockResolvedValue({ ownerId: "owner" });
    db.storageRestoreJob.findUnique.mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(404);
  });

  it("happy path: owner retries own-org job → { data: { retried: true } } and retryRestoreJob called", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
    db.organization.findUnique.mockResolvedValue({ ownerId: "owner" });
    db.storageRestoreJob.findUnique.mockResolvedValue({ orgId: "org1" });
    retryRestoreJob.mockResolvedValue(true);

    const res = await POST(req(), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { retried: true } });
    expect(retryRestoreJob).toHaveBeenCalledWith("job-1");
  });
});
