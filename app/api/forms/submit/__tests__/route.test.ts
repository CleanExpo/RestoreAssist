/**
 * RA-1711 — POST /api/forms/submit template-ownership tests.
 *
 * Covers the cross-tenant IDOR fix: the FormTemplate lookup must be scoped
 * to the caller (owned template OR a shared system template), not looked up
 * by id alone. A crafted templateId belonging to another tenant's private
 * template must 404 and must NOT create a FormSubmission row.
 *
 * No Idempotency-Key header is sent in any request, so withIdempotency
 * (real, unmocked) passes straight through to the handler — same pattern as
 * app/api/forms/interview/complete/__tests__/route.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const formTemplateFindFirst = vi.fn();
const reportFindUnique = vi.fn();
const formSubmissionCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    formTemplate: { findFirst: (...a: unknown[]) => formTemplateFindFirst(...a) },
    report: { findUnique: (...a: unknown[]) => reportFindUnique(...a) },
    formSubmission: { create: (...a: unknown[]) => formSubmissionCreate(...a) },
  },
}));

import { POST } from "../route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/forms/submit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique.mockResolvedValue({ id: "user_1" });
  formSubmissionCreate.mockResolvedValue({
    id: "sub_1",
    submissionNumber: "WO-2026-000001",
    status: "DRAFT",
  });
});

describe("POST /api/forms/submit — template ownership (RA-1711)", () => {
  it("scopes the template lookup to the caller or a system template", async () => {
    formTemplateFindFirst.mockResolvedValue({ id: "tpl_1", userId: "user_1" });

    await POST(makeRequest({ templateId: "tpl_1", formData: { a: 1 } }));

    expect(formTemplateFindFirst).toHaveBeenCalledWith({
      where: {
        id: "tpl_1",
        OR: [{ userId: "user_1" }, { isSystemTemplate: true }],
      },
    });
  });

  it("404s and creates no submission for another tenant's private template", async () => {
    // Ownership-scoped query returns null for a foreign private template.
    formTemplateFindFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ templateId: "foreign_tpl", formData: { a: 1 } }),
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(formSubmissionCreate).not.toHaveBeenCalled();
  });

  it("creates the submission for an owned template", async () => {
    formTemplateFindFirst.mockResolvedValue({ id: "tpl_1", userId: "user_1" });

    const res = await POST(
      makeRequest({ templateId: "tpl_1", formData: { a: 1 } }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(formSubmissionCreate).toHaveBeenCalledTimes(1);
  });
});
