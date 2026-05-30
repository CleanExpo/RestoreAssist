import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const supportTicketFindUnique = vi.fn();
const supportTicketUpdate = vi.fn();
const draftSupportTicketReply = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: {
      findUnique: (...args: unknown[]) => supportTicketFindUnique(...args),
      update: (...args: unknown[]) => supportTicketUpdate(...args),
    },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    _request: NextRequest,
    _scope: string,
    handler: () => Promise<Response>,
  ) => handler(),
}));
vi.mock("@/lib/services/ai/draft-support-ticket", () => ({
  draftSupportTicketReply: (...args: unknown[]) =>
    draftSupportTicketReply(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  supportTicketFindUnique.mockReset();
  supportTicketUpdate.mockReset();
  draftSupportTicketReply.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_user", role: "ADMIN" },
  });
  process.env.ANTHROPIC_API_KEY = "anthropic-key";
  supportTicketFindUnique.mockResolvedValue({
    id: "ticket_1",
    subject: "Need help",
    body: "The customer needs a response draft.",
    category: "technical",
    priority: "normal",
  });
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/support/tickets/ticket_1/draft",
    { method: "POST" },
  );
}

describe("POST /api/support/tickets/[id]/draft", () => {
  it("does not expose provider failure details", async () => {
    draftSupportTicketReply.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "ticket_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "API_ERROR" });
  });
});
