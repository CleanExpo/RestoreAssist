import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const getState = vi.fn();
const transition = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    report: { findUnique: (...args: unknown[]) => reportFindUnique(...args) },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      request: Request,
      _userId: string,
      callback: (rawBody: string) => Promise<Response>,
    ) => callback(await request.text()),
  ),
}));
vi.mock("@/lib/progress/permissions", () => ({
  resolveProgressRole: vi.fn(() => "TECHNICIAN"),
}));
vi.mock("@/lib/progress/service", () => ({
  TRANSITION_KEYS: ["submit_report"],
  getState: (...args: unknown[]) => getState(...args),
  transition: (...args: unknown[]) => transition(...args),
}));

import { GET } from "../route";
import { POST as transitionPOST } from "../transition/route";

const context = { params: Promise.resolve({ reportId: "r_other" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({
    user: { id: "u_demoted", role: "ADMIN" },
  });
  userFindUnique.mockResolvedValue({ role: "USER" });
  reportFindUnique.mockResolvedValue({ id: "r_other", userId: "u_other" });
});

describe("Progress routes with a stale ADMIN JWT", () => {
  it("cannot read another tenant report after DB demotion", async () => {
    const request = new NextRequest("http://localhost/api/progress/r_other");

    const response = await GET(request, context);

    expect(response.status).toBe(404);
    expect(getState).not.toHaveBeenCalled();
  });

  it("cannot transition another tenant report after DB demotion", async () => {
    const request = new NextRequest(
      "http://localhost/api/progress/r_other/transition",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "submit_report" }),
      },
    );

    const response = await transitionPOST(request, context);

    expect(response.status).toBe(404);
    expect(transition).not.toHaveBeenCalled();
  });
});
