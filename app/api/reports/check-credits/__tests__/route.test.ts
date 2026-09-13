import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const canCreateReport = vi.fn();
const hasReportGenerationCredential = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: (...args: unknown[]) => canCreateReport(...args),
}));
vi.mock("@/lib/ai/platform-trial-credential", () => ({
  hasReportGenerationCredential: (...args: unknown[]) =>
    hasReportGenerationCredential(...args),
}));

import { GET } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  canCreateReport.mockReset();
  hasReportGenerationCredential.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  canCreateReport.mockResolvedValue({ allowed: true, reason: null });
});

describe("GET /api/reports/check-credits (RA-6801)", () => {
  it("trial without BYOK but with platform credits may create a report", async () => {
    hasReportGenerationCredential.mockResolvedValue(true);

    const res = await GET(
      new NextRequest("http://localhost/api/reports/check-credits"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasApiKey).toBe(true);
    expect(body.canCreate).toBe(true);
    expect(hasReportGenerationCredential).toHaveBeenCalledWith("u1");
  });

  it("non-trial without a credential cannot pass the key gate", async () => {
    hasReportGenerationCredential.mockResolvedValue(false);

    const res = await GET(
      new NextRequest("http://localhost/api/reports/check-credits"),
    );
    const body = await res.json();

    expect(body.hasApiKey).toBe(false);
    expect(hasReportGenerationCredential).toHaveBeenCalledWith("u1");
  });
});
