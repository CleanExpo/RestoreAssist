import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const notificationFindFirst = vi.fn();
const notificationUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findFirst: (...args: unknown[]) => notificationFindFirst(...args),
      update: (...args: unknown[]) => notificationUpdate(...args),
    },
  },
}));

import { POST } from "../route";

function postRequest() {
  return new NextRequest("http://localhost/api/notifications/notif_1/read", {
    method: "POST",
  });
}

function routeContext(id = "notif_1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  notificationFindFirst.mockReset();
  notificationUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("POST /api/notifications/[id]/read", () => {
  it("returns success:true when the update actually succeeds", async () => {
    notificationFindFirst.mockResolvedValue({ id: "notif_1", read: false });
    notificationUpdate.mockResolvedValue({ id: "notif_1", read: true });

    const response = await POST(postRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notification).toBeDefined();
  });

  it("returns a non-2xx error status (not success:true) when the write actually fails", async () => {
    notificationFindFirst.mockResolvedValue({ id: "notif_1" });
    notificationUpdate.mockRejectedValue(new Error("db connection reset"));

    const response = await POST(postRequest(), routeContext());
    const body = await response.json();

    expect(response.status).not.toBe(200);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(body.success).not.toBe(true);
    // Constitution rule: never leak the raw error message in a 500 body.
    expect(JSON.stringify(body)).not.toContain("db connection reset");
  });

  it("returns a non-2xx error when notification not found", async () => {
    notificationFindFirst.mockResolvedValue(null);

    const response = await POST(postRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).not.toBe(true);
  });

  it("handles welcome notification without write failure", async () => {
    const welcomeRequest = new NextRequest(
      "http://localhost/api/notifications/welcome/read",
      { method: "POST" },
    );
    const response = await POST(welcomeRequest, routeContext("welcome"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
