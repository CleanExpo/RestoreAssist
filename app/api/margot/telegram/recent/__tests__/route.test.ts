import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const order = vi.fn();
const select = vi.fn();
const from = vi.fn();
const getSupabaseServerClient = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: (...args: unknown[]) =>
    getSupabaseServerClient(...args),
}));

import { GET } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  order.mockReset();
  select.mockReset();
  from.mockReset();
  getSupabaseServerClient.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_user", role: "ADMIN" },
  });
  order.mockReturnValue({ limit: vi.fn() });
  select.mockReturnValue({ order });
  from.mockReturnValue({ select });
  getSupabaseServerClient.mockReturnValue({ from });
});

describe("GET /api/margot/telegram/recent", () => {
  it("does not expose Supabase exception messages", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table margot_telegram_log",
      },
    });
    order.mockReturnValueOnce({ limit });

    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({
      data: { messages: [] },
      stale: true,
      reason: "Telegram log unavailable",
    });
  });

  it("keeps the operator-friendly missing-table message", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42P01",
        message: "relation margot_telegram_log does not exist",
      },
    });
    order.mockReturnValueOnce({ limit });

    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({
      data: { messages: [] },
      stale: true,
      reason: "margot_telegram_log table not yet created",
    });
  });
});
