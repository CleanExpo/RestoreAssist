/**
 * L-2 paid-base-plan vs Founding Trial: PDF parse is a paid-plan feature, but
 * an unexpired complimentary grant was promised the $99 base plan for 60 days.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const featureEntitlementFindFirst = vi.fn();
const { pdfParse } = vi.hoisted(() => ({ pdfParse: vi.fn() }));

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    featureEntitlement: {
      findFirst: (...args: unknown[]) => featureEntitlementFindFirst(...args),
    },
  },
}));
// The route loads pdf-parse via createRequire(import.meta.url), which bypasses
// vitest's ESM mock of "pdf-parse". Intercept that require.
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  return {
    ...actual,
    createRequire: (filename: string) => {
      const req = actual.createRequire(filename);
      const wrapped = ((id: string) => {
        if (id === "pdf-parse") {
          return Object.assign(
            (...args: unknown[]) => pdfParse(...args),
            { default: (...args: unknown[]) => pdfParse(...args) },
          );
        }
        return req(id);
      }) as NodeRequire;
      return Object.assign(wrapped, { resolve: req.resolve, cache: req.cache });
    },
  };
});

import { POST } from "../route";
import { COMPLIMENTARY_PRICE_ID } from "@/lib/billing/founding-trial-grant";
import { PAID_BASE_PLAN_MESSAGE } from "@/lib/billing/paid-base-plan-copy";

const DAY = 24 * 60 * 60 * 1000;

function pdfFile() {
  const bytes = Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.alloc(200, 0x20),
    Buffer.from("\n%%EOF\n"),
  ]);
  return new File([bytes], "report.pdf", { type: "application/pdf" });
}

function makeRequest() {
  const form = new FormData();
  form.append("file", pdfFile());
  return new NextRequest("http://localhost/api/reports/parse-pdf", {
    method: "POST",
    body: form,
  });
}

function seedOwner(opts: {
  status: string;
  trialEndsAt: Date | null;
  founding: boolean;
}) {
  userFindUnique.mockResolvedValue({
    id: "user-1",
    role: "ADMIN",
    organizationId: "org-a",
    organization: { ownerId: "user-1" },
    subscriptionStatus: opts.status,
    trialEndsAt: opts.trialEndsAt,
    lifetimeAccess: false,
    creditsRemaining: 10,
  });
  featureEntitlementFindFirst.mockImplementation(
    async (args: { where?: { stripePriceId?: string } } = {}) =>
      opts.founding && args.where?.stripePriceId === COMPLIMENTARY_PRICE_ID
        ? { id: "fe_1" }
        : null,
  );
}

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  featureEntitlementFindFirst.mockReset();
  pdfParse.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  pdfParse.mockResolvedValue({
    text: "Water damage inspection report with enough extracted text for parse.",
  });
  featureEntitlementFindFirst.mockResolvedValue(null);
});

describe("POST /api/reports/parse-pdf — founding-trial grant", () => {
  it("unexpired founding-trial grant gets 200", async () => {
    seedOwner({
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 40 * DAY),
      founding: true,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("expired founding-trial grant gets 402", async () => {
    seedOwner({
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() - DAY),
      founding: true,
    });
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body.error.message).toBe(PAID_BASE_PLAN_MESSAGE);
  });
});
