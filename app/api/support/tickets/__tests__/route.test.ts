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
const resolveWorkspaceAiKey = vi.fn();

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
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) =>
      resolveWorkspaceAiKey(...args),
  };
});

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

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
  resolveWorkspaceAiKey.mockReset();

  // Anonymous public submitter by default.
  getServerSession.mockResolvedValue(null);
  supportTicketCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ticket_test_1",
      ...data,
    }),
  );
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "byok-key",
  });
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
    // Anonymous submitter -> no workspace to resolve a BYOK key from, so
    // analyseTicketWithClaude returns null before the service is ever
    // called; category falls back to the provided value.
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
    // Claude triage requires a resolvable workspace BYOK key -> authenticate.
    getServerSession.mockResolvedValue({ user: { id: "user_1" } });
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
    // Exercises the auth/userId plumbing only — not AI triage — so keep the
    // AI path on its degraded branch, same as the anonymous-submitter test.
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    const res = await POST(postRequest(validPayload));

    expect(res.status).toBe(201);
    const createArg = supportTicketCreate.mock.calls[0][0].data;
    expect(createArg.userId).toBe("user_42");
  });

  it("RA-6921: degrades gracefully — never spends a platform key — for an authenticated user with no workspace BYOK key", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user_42" } });
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    const res = await POST(postRequest(validPayload));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.category).toBe("general");
    expect(json.priority).toBe("normal");
    expect(analyseSupportTicket).not.toHaveBeenCalled();
  });
});
