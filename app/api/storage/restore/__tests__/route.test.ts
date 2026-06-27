import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getServerSession,
  computeRestorePlan,
  enqueueRestorePlan,
  getRestoreQueueStats,
  db,
} = vi.hoisted(() => {
  const db = {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    storageRestoreJob: { findMany: vi.fn(async () => []) },
  };
  return {
    getServerSession: vi.fn(),
    computeRestorePlan: vi.fn(),
    enqueueRestorePlan: vi.fn(),
    getRestoreQueueStats: vi.fn(async () => ({ total: 0 })),
    db,
  };
});

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/restore/plan", () => ({
  computeRestorePlan: (...a: unknown[]) => computeRestorePlan(...a),
  enqueueRestorePlan: (...a: unknown[]) => enqueueRestorePlan(...a),
}));
vi.mock("@/lib/queue/storage-restore", () => ({
  getRestoreQueueStats: (...a: unknown[]) => getRestoreQueueStats(...a),
}));

import { GET, POST } from "@/app/api/storage/restore/route";

function req(url = "http://x/api/storage/restore", body?: unknown) {
  return new Request(url, body ? { method: "POST", body: JSON.stringify(body) } : {}) as any;
}

beforeEach(() => {
  getServerSession.mockReset();
  computeRestorePlan.mockReset();
  enqueueRestorePlan.mockReset();
  db.user.findUnique.mockReset();
  db.organization.findUnique.mockReset();
  db.storageRestoreJob.findMany.mockReset();
  db.storageRestoreJob.findMany.mockResolvedValue([]);
  getRestoreQueueStats.mockReset();
  getRestoreQueueStats.mockResolvedValue({ total: 0 });
});

describe("GET /api/storage/restore", () => {
  it("returns 401 when not signed in", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not the org owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
    db.organization.findUnique.mockResolvedValue({ ownerId: "someone-else" });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns the file count for the owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
    db.organization.findUnique.mockResolvedValue({ ownerId: "owner" });
    computeRestorePlan.mockResolvedValue({ fileCount: 7 });
    const res = await GET(req("http://x/api/storage/restore?scope=org"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.fileCount).toBe(7);
  });
});

describe("POST /api/storage/restore", () => {
  it("enqueues for the owner and returns the count", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
    db.organization.findUnique.mockResolvedValue({ ownerId: "owner" });
    enqueueRestorePlan.mockResolvedValue({ enqueued: 7 });
    const res = await POST(req("http://x/api/storage/restore", { scope: "org", mode: "MISSING" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { enqueued: 7 } });
    expect(enqueueRestorePlan).toHaveBeenCalledWith("org1", { type: "org" }, "MISSING", "owner");
  });
});
