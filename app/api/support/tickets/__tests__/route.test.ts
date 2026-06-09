import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Public contact/support submission endpoint. Backs the website contact form
// (app/contact/page.tsx) and the in-app support widget. These tests lock the
// validation contract and the AI-degradation fallback so the contact journey
// cannot silently regress.

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const supportTicketCreate = vi.fn();
const analyseSupportTicket = vi.fn();

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
      create: (...args: unknown[]) => supportTicketCreate(...args),
    },
  },
}));
vi.mock("@/lib/services/ai/analyse-support-ticket", () => ({
  analyseSupportTicket: (...args: unknown[]) => analyseSupportTicket(...args),
}));

import { POST } from "../route";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/support/tickets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  name: "Jane Restorer",
  email: "jane@example.com",
  subject: "Website contact enquiry",
  body: "I run a two-person water-damage business and want to trial RestoreAssist.",
  category: "general" as const,
};

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  supportTicketCreate.mockReset();
  analyseSupportTicket.mockReset();

  // Anonymous public submitter by default.
  getServerSession.mockResolvedValue(null);
  supportTicketCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ticket_test_1",
      ...data,
    }),
  );
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/support/tickets (public contact submission)", () => {
  it("rejects an invalid email with 422 and does not create a ticket", async () => {
    const res = await POST(
      postRequest({ ...validPayload, email: "not-an-email" }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(Array.isArray(json.issues)).toBe(true);
    expect(supportTicketCreate).not.toHaveBeenCalled();
  });

  it("rejects a too-short message with 422", async () => {
    const res = await POST(postRequest({ ...validPayload, body: "too short" }));
    expect(res.status).toBe(422);
    expect(supportTicketCreate).not.toHaveBeenCalled();
  });

  it("creates a ticket and returns 201 when AI is unavailable (degraded path)", async () => {
    // No ANTHROPIC_API_KEY -> analyseTicketWithClaude returns null before the
    // service is ever called; category falls back to the provided value.
    const res = await POST(postRequest(validPayload));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("ticket_test_1");
    expect(json.category).toBe("general");
    expect(json.priority).toBe("normal");
    expect(json.message).toMatch(/24 hours/i);

    expect(analyseSupportTicket).not.toHaveBeenCalled();
    expect(supportTicketCreate).toHaveBeenCalledTimes(1);
    const createArg = supportTicketCreate.mock.calls[0][0].data;
    expect(createArg).toMatchObject({
      email: validPayload.email,
      name: validPayload.name,
      subject: validPayload.subject,
      body: validPayload.body,
      category: "general",
      priority: "normal",
    });
    // Anonymous submission must not attach a userId.
    expect(createArg.userId).toBeUndefined();
  });

  it("uses Claude triage (category/priority) when the AI service succeeds", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    analyseSupportTicket.mockResolvedValue({
      ok: true,
      data: {
        category: "billing",
        priority: "high",
        responseDraft: "Draft reply.",
      },
    });

    const res = await POST(postRequest(validPayload));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.category).toBe("billing");
    expect(json.priority).toBe("high");
    expect(analyseSupportTicket).toHaveBeenCalledTimes(1);
    const createArg = supportTicketCreate.mock.calls[0][0].data;
    expect(createArg.responseDraft).toBe("Draft reply.");
  });

  it("attaches userId when an authenticated user submits", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user_42" } });

    const res = await POST(postRequest(validPayload));

    expect(res.status).toBe(201);
    const createArg = supportTicketCreate.mock.calls[0][0].data;
    expect(createArg.userId).toBe("user_42");
  });
});
