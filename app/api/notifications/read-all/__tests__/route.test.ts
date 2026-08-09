import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const notificationUpdateMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      updateMany: (...args: unknown[]) => notificationUpdateMany(...args),
    },
  },
}));

import { POST } from "../route";

function postRequest() {
  return new NextRequest("http://localhost/api/notifications/read-all", {
    method: "POST",
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  notificationUpdateMany.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("POST /api/notifications/read-all", () => {
  it("returns success only after the authenticated user's update succeeds", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 2 });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(notificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", read: false },
      data: { read: true },
    });
  });

  it("returns a generic 500 instead of success when the database write fails", async () => {
    notificationUpdateMany.mockRejectedValue(new Error("db connection reset"));

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).not.toBe(true);
    expect(JSON.stringify(body)).not.toContain("db connection reset");
  });
});
