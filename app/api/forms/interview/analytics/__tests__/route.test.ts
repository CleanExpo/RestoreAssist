import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const formTemplateFindUnique = vi.fn();
const getTemplatePerformanceAnalytics = vi.fn();
const userFindMany = vi.fn();
const getUserAnalyticsSummary = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      findMany: (...args: unknown[]) => userFindMany(...args),
    },
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
    getUserAnalyticsSummary: (...args: unknown[]) =>
      getUserAnalyticsSummary(...args),
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
  userFindMany.mockReset();
  getUserAnalyticsSummary.mockReset().mockResolvedValue({});
  delete process.env.PLATFORM_SUPPORT_USER_IDS;

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique.mockResolvedValue({
    id: "user_1",
    role: "USER",
    organizationId: "org_a",
  });
  // org_a has user_1 and teammate_a; other_user belongs to another firm.
  userFindMany.mockResolvedValue([{ id: "user_1" }, { id: "teammate_a" }]);
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
    expect(getTemplatePerformanceAnalytics).toHaveBeenCalledWith("tpl_mine", [
      "user_1",
    ]);
  });

  it("allows a shared system template regardless of owner", async () => {
    formTemplateFindUnique.mockResolvedValue({
      userId: "other_user",
      isSystemTemplate: true,
    });

    const response = await GET(getRequest("?templateId=tpl_system"));

    expect(response.status).toBe(200);
    expect(getTemplatePerformanceAnalytics).toHaveBeenCalledWith("tpl_system", [
      "user_1",
    ]);
  });

  it("refuses a firm ADMIN another firm's private template [ra-8043b]", async () => {
    userFindUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      organizationId: "org_a",
    });
    formTemplateFindUnique.mockResolvedValue({
      userId: "other_user",
      isSystemTemplate: false,
    });

    const response = await GET(getRequest("?templateId=tpl_other"));

    expect(response.status).toBe(403);
    expect(getTemplatePerformanceAnalytics).not.toHaveBeenCalled();
  });

  it("allows a firm ADMIN a teammate's template, counting only their firm's sessions [ra-8043b]", async () => {
    userFindUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      organizationId: "org_a",
    });
    formTemplateFindUnique.mockResolvedValue({
      userId: "teammate_a",
      isSystemTemplate: false,
    });

    const response = await GET(getRequest("?templateId=tpl_team"));

    expect(response.status).toBe(200);
    expect(getTemplatePerformanceAnalytics).toHaveBeenCalledWith("tpl_team", [
      "user_1",
      "teammate_a",
    ]);
  });

  it("counts only the firm's own sessions on a shared system template [ra-8043b]", async () => {
    userFindUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      organizationId: "org_a",
    });
    formTemplateFindUnique.mockResolvedValue({
      userId: "other_user",
      isSystemTemplate: true,
    });

    const response = await GET(getRequest("?templateId=tpl_system"));

    expect(response.status).toBe(200);
    const [, sessionUserIds] = getTemplatePerformanceAnalytics.mock.calls[0];
    expect(sessionUserIds).toEqual(["user_1", "teammate_a"]);
  });

  it("lets platform support see any template across every firm [ra-8043b]", async () => {
    process.env.PLATFORM_SUPPORT_USER_IDS = "user_1";
    userFindUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      organizationId: "org_a",
    });
    formTemplateFindUnique.mockResolvedValue({
      userId: "other_user",
      isSystemTemplate: false,
    });

    const response = await GET(getRequest("?templateId=tpl_other"));

    expect(response.status).toBe(200);
    expect(getTemplatePerformanceAnalytics).toHaveBeenCalledWith(
      "tpl_other",
      undefined,
    );
  });

  it("404s when the templateId does not exist", async () => {
    formTemplateFindUnique.mockResolvedValue(null);

    const response = await GET(getRequest("?templateId=tpl_missing"));

    expect(response.status).toBe(404);
    expect(getTemplatePerformanceAnalytics).not.toHaveBeenCalled();
  });
});

describe("GET /api/forms/interview/analytics?userId=... — firm scope", () => {
  it("refuses a firm ADMIN another firm's user [ra-8043b]", async () => {
    userFindUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      organizationId: "org_a",
    });

    const response = await GET(getRequest("?userId=other_user"));

    expect(response.status).toBe(403);
    expect(getUserAnalyticsSummary).not.toHaveBeenCalled();
  });

  it("refuses an org-less ADMIN anyone but themselves [ra-8043b]", async () => {
    userFindUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      organizationId: null,
    });

    const response = await GET(getRequest("?userId=other_user"));

    expect(response.status).toBe(403);
    expect(getUserAnalyticsSummary).not.toHaveBeenCalled();
  });

  it("allows a firm ADMIN their own teammate", async () => {
    userFindUnique.mockResolvedValue({
      id: "user_1",
      role: "ADMIN",
      organizationId: "org_a",
    });

    const response = await GET(getRequest("?userId=teammate_a"));

    expect(response.status).toBe(200);
    expect(getUserAnalyticsSummary).toHaveBeenCalledWith("teammate_a");
  });

  it("refuses a USER another user", async () => {
    const response = await GET(getRequest("?userId=teammate_a"));

    expect(response.status).toBe(403);
  });
});
