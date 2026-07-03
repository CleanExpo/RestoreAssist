import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const notificationFindFirst = vi.fn();
const notificationDelete = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findFirst: (...args: unknown[]) => notificationFindFirst(...args),
      delete: (...args: unknown[]) => notificationDelete(...args),
    },
  },
}));

import { DELETE } from "../route";

function deleteRequest() {
  return new NextRequest("http://localhost/api/notifications/notif_1", {
    method: "DELETE",
  });
}

function routeContext(id = "notif_1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  notificationFindFirst.mockReset();
  notificationDelete.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("DELETE /api/notifications/[id]", () => {
  it("returns success:true when the delete actually succeeds", async () => {
    notificationFindFirst.mockResolvedValue({ id: "notif_1" });
    notificationDelete.mockResolvedValue({ id: "notif_1" });

    const response = await DELETE(deleteRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns a non-2xx error status (not success:true) when the write actually fails", async () => {
    notificationFindFirst.mockResolvedValue({ id: "notif_1" });
    notificationDelete.mockRejectedValue(new Error("db connection reset"));

    const response = await DELETE(deleteRequest(), routeContext());
    const body = await response.json();

    expect(response.status).not.toBe(200);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(body.success).not.toBe(true);
    // Constitution rule: never leak the raw error message in a 500 body.
    expect(JSON.stringify(body)).not.toContain("db connection reset");
  });

  it("maps a concurrent-delete race (already gone) to 404, not a false success", async () => {
    notificationFindFirst.mockResolvedValue({ id: "notif_1" });
    const p2025 = Object.assign(new Error("Record not found"), {
      code: "P2025",
    });
    notificationDelete.mockRejectedValue(p2025);

    const response = await DELETE(deleteRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).not.toBe(true);
  });
});
