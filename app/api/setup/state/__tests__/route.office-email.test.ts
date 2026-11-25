/**
 * RA-8516: the setup wizard saves the organisation's business email, which
 * is also the office inbox told when a technician submits a job visit
 * (RA-8503). It is trimmed and checked by the same parseEmail the
 * organisation profile save and the send use. Offline: prisma is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { PATCH } = await import("../route");

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new Request("http://localhost/api/setup/state", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );

describe("PATCH /api/setup/state: office email (RA-8516)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockFindFirst.mockResolvedValue({
      id: "org-1",
      country: "AU",
      timezone: "Australia/Sydney",
      abn: null,
      nzbn: null,
      email: null,
      setupCompletedAt: null,
    });
    mockUpdate.mockResolvedValue({});
  });

  it("saves a trimmed office email", async () => {
    const res = await patch({ email: "  office@example.com " });
    expect(res.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ email: "office@example.com" });
  });

  it.each([
    "office@example.com,other.invalid",
    "office@example..com",
    "front desk",
  ])("refuses %j", async (email) => {
    const res = await patch({ email });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/valid email/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("clears the office email when only spaces are sent", async () => {
    const res = await patch({ email: "   " });
    expect(res.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ email: null });
  });

  it("an unchanged older value does not block the rest of the step", async () => {
    mockFindFirst.mockResolvedValue({
      id: "org-1",
      country: "AU",
      timezone: "Australia/Sydney",
      abn: null,
      nzbn: null,
      email: "front desk",
      setupCompletedAt: null,
    });
    const res = await patch({ email: "front desk", tradingName: "Sample Restorations" });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
