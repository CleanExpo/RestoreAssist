import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  reportFindFirst: vi.fn(),
  emailAuditCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
  resolveResendConfig: vi.fn(),
  resendSend: vi.fn(),
  idempotencyCreate: vi.fn(),
  idempotencyFindUnique: vi.fn(),
  idempotencyUpdate: vi.fn(),
  idempotencyDeleteMany: vi.fn(),
  idempotencyRecords: new Map<string, Record<string, unknown>>(),
}));

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mocks.getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: mocks.reportFindFirst },
    emailAudit: { create: mocks.emailAuditCreate },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.transaction,
    idempotencyRecord: {
      create: mocks.idempotencyCreate,
      findUnique: mocks.idempotencyFindUnique,
      update: mocks.idempotencyUpdate,
      deleteMany: mocks.idempotencyDeleteMany,
    },
  },
}));
vi.mock("@/lib/email/resolve-resend-config", () => ({
  resolveResendConfig: (...args: unknown[]) =>
    mocks.resolveResendConfig(...args),
}));
vi.mock("@/lib/email", () => ({
  escapeHtml: (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;"),
  withEmailTimeout: <T>(promise: Promise<T>) => promise,
}));
vi.mock("@/lib/portal-token", () => ({
  generateInsurerToken: () => "signed-report-token",
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.resendSend };
  },
}));

import { POST } from "../route";

const params = { params: Promise.resolve({ id: "report_1" }) };

function request(idempotencyKey = "report-send-attempt-1") {
  return new NextRequest("http://localhost/api/reports/report_1/send", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  });
}

function completedReport() {
  return {
    id: "report_1",
    title: "Final restoration report",
    reportNumber: "NIR-001",
    propertyAddress: "1 Test Street",
    status: "COMPLETED",
    inspection: { id: "inspection_1" },
    client: {
      name: "Alex Client",
      email: "alex@example.com",
      userId: "user_1",
    },
    user: {
      name: "Pat Restorer",
      email: "pat@example.com",
      businessName: "Pat Restoration",
      businessEmail: "office@pat.example",
      organizationId: "org_1",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.idempotencyRecords.clear();
  process.env.NEXTAUTH_URL = "https://restoreassist.test";

  mocks.getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.reportFindFirst.mockResolvedValue(completedReport());
  mocks.resolveResendConfig.mockResolvedValue({
    apiKey: "re_test_byok",
    from: "Pat Restoration <reports@pat.example>",
    source: "byok",
  });
  mocks.resendSend.mockResolvedValue({
    data: { id: "email_provider_1" },
    error: null,
  });
  mocks.emailAuditCreate.mockResolvedValue({ id: "email_audit_1" });
  mocks.auditLogCreate.mockResolvedValue({
    id: "audit_1",
    timestamp: new Date(),
  });
  mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
    Promise.all(operations),
  );

  mocks.idempotencyDeleteMany.mockImplementation(
    ({ where }: { where?: { cacheKey?: string } } = {}) => {
      if (where?.cacheKey) mocks.idempotencyRecords.delete(where.cacheKey);
      return { count: 0 };
    },
  );
  mocks.idempotencyCreate.mockImplementation(
    ({ data }: { data: Record<string, unknown> & { cacheKey: string } }) => {
      if (mocks.idempotencyRecords.has(data.cacheKey)) {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }
      const record = {
        ...data,
        responseStatus: null,
        responseBody: null,
        responseContentType: null,
      };
      mocks.idempotencyRecords.set(data.cacheKey, record);
      return record;
    },
  );
  mocks.idempotencyFindUnique.mockImplementation(
    ({ where }: { where: { cacheKey: string } }) =>
      mocks.idempotencyRecords.get(where.cacheKey) ?? null,
  );
  mocks.idempotencyUpdate.mockImplementation(
    ({
      where,
      data,
    }: {
      where: { cacheKey: string };
      data: Record<string, unknown>;
    }) => {
      const current = mocks.idempotencyRecords.get(where.cacheKey) ?? {};
      const updated = { ...current, ...data };
      mocks.idempotencyRecords.set(where.cacheKey, updated);
      return updated;
    },
  );
});

describe("POST /api/reports/[id]/send", () => {
  it("records REPORT_SENT only after the provider accepts the message", async () => {
    const response = await POST(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sent: true,
      deliveryStatus: "provider_accepted",
      providerMessageId: "email_provider_1",
      recipientEmail: "alex@example.com",
    });
    expect(mocks.resolveResendConfig).toHaveBeenCalledWith("org_1");
    expect(mocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Pat Restoration <reports@pat.example>",
        to: "alex@example.com",
        replyTo: "office@pat.example",
        html: expect.stringContaining(
          "https://restoreassist.test/reports/report_1/view?token=signed-report-token",
        ),
      }),
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.emailAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reportId: "report_1",
        recipient: "alex@example.com",
        success: true,
      }),
      select: { id: true },
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionId: "inspection_1",
        userId: "user_1",
        action: "REPORT_SENT",
        entityType: "Report",
        entityId: "report_1",
        changes: expect.stringContaining(
          '"providerMessageId":"email_provider_1"',
        ),
      }),
      select: { id: true, timestamp: true },
    });
  });

  it("replays a completed idempotent response without sending or auditing twice", async () => {
    const first = await POST(request("same-report-send-key"), params);
    const second = await POST(request("same-report-send-key"), params);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1);
    expect(mocks.emailAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("does not resend after provider acceptance when audit persistence fails", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("database unavailable"));

    const first = await POST(request("accepted-audit-failed"), params);
    const firstBody = await first.json();
    const replay = await POST(request("accepted-audit-failed"), params);

    expect(first.status).toBe(409);
    expect(firstBody.error.message).toContain(
      "delivery evidence could not be saved",
    );
    expect(replay.status).toBe(409);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("does not record REPORT_SENT when the provider rejects the message", async () => {
    mocks.resendSend.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "domain rejected" },
    });

    const response = await POST(request(), params);

    expect(response.status).toBe(503);
    expect(mocks.emailAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reportId: "report_1",
        recipient: "alex@example.com",
        success: false,
        error: "provider_rejected",
      }),
      select: { id: true },
    });
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("fails closed with a setup error when no email provider is configured", async () => {
    mocks.resolveResendConfig.mockResolvedValueOnce(null);

    const response = await POST(request(), params);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toContain("Connect Resend in Integrations");
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.emailAuditCreate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("uses tenant ownership and rejects an inaccessible report before sending", async () => {
    mocks.reportFindFirst.mockResolvedValueOnce(null);

    const response = await POST(request(), params);

    expect(response.status).toBe(404);
    expect(mocks.reportFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "report_1", userId: "user_1" } }),
    );
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("does not send to a client record owned by another tenant", async () => {
    mocks.reportFindFirst.mockResolvedValueOnce({
      ...completedReport(),
      client: {
        name: "Foreign Client",
        email: "foreign@example.com",
        userId: "different_user",
      },
    });

    const response = await POST(request(), params);

    expect(response.status).toBe(409);
    expect(mocks.resolveResendConfig).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before reading or sending the report", async () => {
    const response = await POST(request(""), params);

    expect(response.status).toBe(400);
    expect(mocks.reportFindFirst).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });
});
