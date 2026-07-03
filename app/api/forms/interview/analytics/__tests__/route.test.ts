import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const formTemplateFindUnique = vi.fn();
const getTemplatePerformanceAnalytics = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    formTemplate: {
      findUnique: (...args: unknown[]) => formTemplateFindUnique(...args),
    },
  },
}));
vi.mock("@/lib/forms/analytics", () => ({
  InterviewAnalyticsService: {
    getTemplatePerformanceAnalytics: (...args: unknown[]) =>
      getTemplatePerformanceAnalytics(...args),
    getAggregateStatisticsForUser: vi.fn().mockResolvedValue({}),
    getUserAnalyticsSummary: vi.fn().mockResolvedValue({}),
  },
}));

import { GET } from "../route";

function getRequest(query: string) {
  return new NextRequest(
    `http://localhost/api/forms/interview/analytics${query}`,
  );
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  formTemplateFindUnique.mockReset();
  getTemplatePerformanceAnalytics.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique.mockResolvedValue({ id: "user_1", role: "USER" });
  getTemplatePerformanceAnalytics.mockResolvedValue({ totalSessions: 5 });
});

describe("GET /api/forms/interview/analytics?templateId=... — ownership check", () => {
  it("rejects a templateId belonging to a different, non-system user's template", async () => {
    formTemplateFindUnique.mockResolvedValue({
      userId: "other_user",
      isSystemTemplate: false,
    });

    const response = await GET(getRequest("?templateId=tpl_other"));

    expect(response.status).toBe(403);
    expect(getTemplatePerformanceAnalytics).not.toHaveBeenCalled();
  });

  it("allows the template's own owner", async () => {
    formTemplateFindUnique.mockResolvedValue({
      userId: "user_1",
      isSystemTemplate: false,
    });

    const response = await GET(getRequest("?templateId=tpl_mine"));

    expect(response.status).toBe(200);
    expect(getTemplatePerformanceAnalytics).toHaveBeenCalledWith("tpl_mine");
  });

  it("allows a shared system template regardless of owner", async () => {
    formTemplateFindUnique.mockResolvedValue({
      userId: "other_user",
      isSystemTemplate: true,
    });

    const response = await GET(getRequest("?templateId=tpl_system"));

    expect(response.status).toBe(200);
    expect(getTemplatePerformanceAnalytics).toHaveBeenCalledWith("tpl_system");
  });

  it("allows an ADMIN to view any template", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", role: "ADMIN" });
    formTemplateFindUnique.mockResolvedValue({
      userId: "other_user",
      isSystemTemplate: false,
    });

    const response = await GET(getRequest("?templateId=tpl_other"));

    expect(response.status).toBe(200);
  });

  it("404s when the templateId does not exist", async () => {
    formTemplateFindUnique.mockResolvedValue(null);

    const response = await GET(getRequest("?templateId=tpl_missing"));

    expect(response.status).toBe(404);
    expect(getTemplatePerformanceAnalytics).not.toHaveBeenCalled();
  });
});
