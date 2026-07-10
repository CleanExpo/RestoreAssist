import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the streamText call so we can assert the system prompt (tenancy).
const streamTextMock = vi.fn(() => ({
  toUIMessageStreamResponse: () => new Response("stream"),
}));
vi.mock("ai", () => ({
  streamText: (args: unknown) => streamTextMock(args),
  convertToModelMessages: async (m: unknown) => m,
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/ai/openrouter", () => ({
  getOpenRouterApiKey: () => "or-key",
  createMargotModel: () => ({ id: "model" }),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    inspection: { findMany: vi.fn(async () => []) },
    report: { findMany: vi.fn(async () => []) },
  },
}));
// Deterministic pricing grounding that echoes the org it was scoped to.
vi.mock("@/lib/pricing/org-pricing", () => ({
  PRICING_HINT: /rate|price|charge/i,
  buildPricingGrounding: vi.fn(async (_prisma: unknown, orgId: string | null) =>
    orgId ? `\n\n--- YOUR RATES (org ${orgId}) ---` : "",
  ),
}));

import { getServerSession } from "next-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const rateLimit = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const sub = getEffectiveSubscription as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  inspection: { findMany: ReturnType<typeof vi.fn> };
  report: { findMany: ReturnType<typeof vi.fn> };
};
const userFind = p.user.findUnique;

function post(body: unknown = { messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }) {
  return new Request("https://restoreassist.app/api/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function pricingMsg(text = "what is my hourly charge out rate") {
  return { messages: [{ role: "user", parts: [{ type: "text", text }] }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONTRACTOR_ASSISTANT_ENABLED = "true";
  session.mockResolvedValue({ user: { id: "user_a" } });
  rateLimit.mockResolvedValue(null);
  sub.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  userFind.mockResolvedValue({ organizationId: "org_A" });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CONTRACTOR_ASSISTANT_ENABLED;
});

describe("POST /api/assistant/chat — gating chain", () => {
  it("AC1: dark by default — 404 and no model call when flag off", async () => {
    process.env.CONTRACTOR_ASSISTANT_ENABLED = "false";
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("AC2: 401 without a session", async () => {
    session.mockResolvedValueOnce(null);
    expect((await POST(post())).status).toBe(401);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("AC3: 402 when subscription is not TRIAL/ACTIVE", async () => {
    sub.mockResolvedValueOnce({ subscriptionStatus: "CANCELED" });
    expect((await POST(post())).status).toBe(402);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("AC6: 429 when rate-limited (per userId)", async () => {
    rateLimit.mockResolvedValueOnce(
      new Response("rate", { status: 429 }) as never,
    );
    expect((await POST(post())).status).toBe(429);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("400 on an empty messages array", async () => {
    expect((await POST(post({ messages: [] }))).status).toBe(400);
  });
});

describe("POST /api/assistant/chat — persona + tenancy", () => {
  it("AC7: streams with a de-hardwired persona (no 'Phill', no tools)", async () => {
    await POST(post());
    const arg = streamTextMock.mock.calls[0][0] as { system: string; tools?: unknown };
    expect(arg.system).toContain("RestoreAssist assistant");
    expect(arg.system).not.toContain("Phill");
    expect(arg.system).toContain("READ-ONLY");
    expect(arg.tools).toBeUndefined();
  });

  it("inc2: a 'my recent jobs' query grounds on the caller's OWN userId only", async () => {
    session.mockResolvedValueOnce({ user: { id: "user_a" } });
    p.inspection.findMany.mockResolvedValueOnce([
      {
        inspectionNumber: "NIR-1",
        propertyAddress: "1 Test St",
        status: "SCOPED",
        createdAt: new Date("2026-07-04T00:00:00Z"),
      },
    ]);
    await POST(post({ messages: [{ role: "user", parts: [{ type: "text", text: "show me my recent inspections" }] }] }));
    // tenancy: work query scoped to the caller
    expect(p.inspection.findMany.mock.calls[0][0].where).toEqual({ userId: "user_a" });
    const arg = streamTextMock.mock.calls[0][0] as { system: string };
    expect(arg.system).toContain("YOUR RECENT WORK");
    expect(arg.system).toContain("NIR-1");
  });

  it("does NOT pull work context for a non-work question", async () => {
    await POST(post()); // "hi"
    expect(p.inspection.findMany).not.toHaveBeenCalled();
  });

  it("AC4/AC5: pricing grounding is scoped to the CALLER's own org only", async () => {
    userFind.mockResolvedValueOnce({ organizationId: "org_A" });
    await POST(post(pricingMsg()));
    let arg = streamTextMock.mock.calls[0][0] as { system: string };
    expect(arg.system).toContain("YOUR RATES (org org_A)");
    expect(arg.system).not.toContain("org_B");

    // A different tenant asking the same question gets only THEIR rates.
    streamTextMock.mockClear();
    session.mockResolvedValueOnce({ user: { id: "user_b" } });
    userFind.mockResolvedValueOnce({ organizationId: "org_B" });
    await POST(post(pricingMsg()));
    arg = streamTextMock.mock.calls[0][0] as { system: string };
    expect(arg.system).toContain("YOUR RATES (org org_B)");
    expect(arg.system).not.toContain("org_A");
  });
});
