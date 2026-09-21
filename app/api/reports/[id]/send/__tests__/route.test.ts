/**
 * RA-7632 — POST /api/reports/[id]/send.
 *
 * Close Job requires a REPORT_SENT delivery record, and before this route
 * nothing in the product wrote one: no job could close and no client ever
 * received their report by email.
 *
 * What these tests hold the route to:
 *   - refusals (not COMPLETED, no client email, another business, no linked
 *     job, a repeated Idempotency-Key) send no email and write no rows;
 *   - a good send emails once, with every user-supplied value escaped and a
 *     working signed link, and only THEN writes EmailAudit plus an AuditLog
 *     REPORT_SENT row inside one interactive transaction;
 *   - a failed send writes nothing and returns a message the UI can show.
 *
 * Tenancy runs through the real `assertReportTenancy` (only Prisma is faked
 * underneath it), and the link is checked with the real `verifyInsurerToken`,
 * so neither can pass by being mocked away. The email sender is always a mock:
 * these tests never send a real email.
 */

import { randomBytes } from "crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { verifyInsurerToken } from "@/lib/portal-token";

const getServerSession = vi.fn();
const withIdempotency = vi.fn();
const userFindUnique = vi.fn();
const reportLookup = vi.fn();
const transaction = vi.fn();
const txEmailAuditCreate = vi.fn();
const txAuditLogCreate = vi.fn();
const topLevelEmailAuditCreate = vi.fn();
const topLevelAuditLogCreate = vi.fn();
const emailSend = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (...args: unknown[]) => withIdempotency(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    report: {
      findUnique: (...args: unknown[]) => reportLookup(...args),
      findFirst: (...args: unknown[]) => reportLookup(...args),
    },
    // Writes outside the transaction must never happen; these exist so a
    // stray top-level write is observed rather than crashing the test.
    emailAudit: {
      create: (...args: unknown[]) => topLevelEmailAuditCreate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => topLevelAuditLogCreate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));
vi.mock("@/lib/email/send-transactional", () => ({
  EMAIL_SEND_TIMEOUT_MS: 10_000,
  sendTransactionalEmail: (...args: unknown[]) => emailSend(...args),
}));

import { POST } from "../route";

const REPORT_ID = "report-1";
const INSPECTION_ID = "inspection-1";
const OWNER_ID = "user-1";
const FOREIGN_ADMIN_ID = "admin-b";
const HOSTILE = "Bob <script>alert(1)</script>";
const APP_URL = "https://app.example.test";

const users: Record<string, { role: string; organizationId: string }> = {
  [OWNER_ID]: { role: "USER", organizationId: "org-a" },
  [FOREIGN_ADMIN_ID]: { role: "ADMIN", organizationId: "org-b" },
};

function completedReport(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    userId: OWNER_ID,
    status: "COMPLETED",
    title: "Water damage assessment",
    reportNumber: "RPT-0042",
    clientName: HOSTILE,
    propertyAddress: "12 Harbour St & Co, Sydney NSW 2000",
    user: {
      organizationId: "org-a",
      name: "Owner One",
      email: "owner@firm-a.example",
      businessName: "Firm A <b>Restoration</b>",
      businessEmail: "office@firm-a.example",
    },
    client: { name: HOSTILE, email: "bob@client.example" },
    inspection: { id: INSPECTION_ID },
    ...overrides,
  };
}

let currentReport: ReturnType<typeof completedReport> | null;
let idempotencyCache: Map<string, { status: number; body: string }>;

function makeRequest(idempotencyKey?: string) {
  return new NextRequest(`http://localhost/api/reports/${REPORT_ID}/send`, {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  });
}
const params = () => ({ params: Promise.resolve({ id: REPORT_ID }) });

function expectNothingSentOrWritten() {
  expect(emailSend).not.toHaveBeenCalled();
  expect(transaction).not.toHaveBeenCalled();
  expect(txEmailAuditCreate).not.toHaveBeenCalled();
  expect(txAuditLogCreate).not.toHaveBeenCalled();
  expect(topLevelEmailAuditCreate).not.toHaveBeenCalled();
  expect(topLevelAuditLogCreate).not.toHaveBeenCalled();
}

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "PORTAL_SECRET",
  "NEXTAUTH_URL",
  "MAILTRAP_API_KEY",
  "SENDER_EMAIL",
  "PLATFORM_SUPPORT_USER_IDS",
];

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  // A throwaway signing secret minted per run: nothing secret-shaped is
  // committed, and the real verifier below proves the link is genuine.
  process.env.PORTAL_SECRET = randomBytes(32).toString("hex");
  process.env.NEXTAUTH_URL = `${APP_URL}/`;
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

beforeEach(() => {
  process.env.MAILTRAP_API_KEY = "test-key";
  process.env.SENDER_EMAIL = "support@restoreassist.app";
  delete process.env.PLATFORM_SUPPORT_USER_IDS;

  for (const fn of [
    getServerSession,
    withIdempotency,
    userFindUnique,
    reportLookup,
    transaction,
    txEmailAuditCreate,
    txAuditLogCreate,
    topLevelEmailAuditCreate,
    topLevelAuditLogCreate,
    emailSend,
  ]) {
    fn.mockReset();
  }

  currentReport = completedReport();
  idempotencyCache = new Map();

  getServerSession.mockResolvedValue({ user: { id: OWNER_ID } });
  userFindUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => users[where.id] ?? null,
  );
  reportLookup.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      currentReport && where.id === currentReport.id ? currentReport : null,
  );

  // Replay semantics keyed on (scope, Idempotency-Key), like the real
  // middleware: a repeat returns the first response without running the
  // handler. If the route ever stops routing its work through
  // withIdempotency, the repeated-key test sends twice and fails.
  withIdempotency.mockImplementation(
    async (
      req: NextRequest,
      scope: string,
      handler: (body: string) => Promise<Response>,
    ) => {
      const key = req.headers.get("idempotency-key");
      const bodyText = await req.text();
      if (!key) return handler(bodyText);
      const cacheKey = `${scope}:${key}`;
      const cached = idempotencyCache.get(cacheKey);
      if (cached) {
        return new NextResponse(cached.body, {
          status: cached.status,
          headers: {
            "Content-Type": "application/json",
            "Idempotent-Replayed": "true",
          },
        });
      }
      const response = await handler(bodyText);
      if (response.status < 500) {
        idempotencyCache.set(cacheKey, {
          status: response.status,
          body: await response.clone().text(),
        });
      }
      return response;
    },
  );

  transaction.mockImplementation(async (work: unknown) => {
    if (typeof work !== "function") {
      throw new Error("expected an interactive $transaction(fn)");
    }
    return work({
      emailAudit: { create: txEmailAuditCreate },
      auditLog: { create: txAuditLogCreate },
    });
  });
  txEmailAuditCreate.mockResolvedValue({ id: "email-audit-1" });
  txAuditLogCreate.mockResolvedValue({
    id: "audit-1",
    timestamp: new Date("2026-09-21T10:00:00.000Z"),
  });
  emailSend.mockResolvedValue({ data: { id: "provider-msg-1" }, error: null });
});

describe("POST /api/reports/[id]/send — refusals send nothing and write nothing", () => {
  it.each(["DRAFT", "PENDING", "APPROVED", "ARCHIVED"])(
    "refuses a %s report",
    async (status) => {
      currentReport = completedReport({ status });

      const res = await POST(makeRequest(), params());
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(typeof json.error.message).toBe("string");
      expect(json.error.message.length).toBeGreaterThan(0);
      expectNothingSentOrWritten();
    },
  );

  it.each([
    ["no client record", { client: null }],
    ["an empty client email", { client: { name: "Bob", email: "" } }],
    ["a blank client email", { client: { name: "Bob", email: "   " } }],
  ])("refuses a report with %s", async (_label, overrides) => {
    currentReport = completedReport(overrides);

    const res = await POST(makeRequest(), params());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.message).toMatch(/email/i);
    expectNothingSentOrWritten();
  });

  it("returns 404 to another business's ADMIN", async () => {
    getServerSession.mockResolvedValue({ user: { id: FOREIGN_ADMIN_ID } });

    const res = await POST(makeRequest(), params());

    expect(res.status).toBe(404);
    expectNothingSentOrWritten();
  });

  it("returns 404 for a report that does not exist", async () => {
    currentReport = null;

    const res = await POST(makeRequest(), params());

    expect(res.status).toBe(404);
    expectNothingSentOrWritten();
  });

  it("refuses a report that is not linked to a job, because Close Job reads the record by job", async () => {
    currentReport = completedReport({ inspection: null });

    const res = await POST(makeRequest(), params());

    expect(res.status).toBe(409);
    expectNothingSentOrWritten();
  });

  it("returns 401 without a session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest(), params());

    expect(res.status).toBe(401);
    expectNothingSentOrWritten();
  });

  it("a repeated Idempotency-Key sends no second email and writes no second record", async () => {
    const first = await POST(makeRequest("send-key-0001"), params());
    expect(first.status).toBe(200);
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(txEmailAuditCreate).toHaveBeenCalledTimes(1);

    const repeat = await POST(makeRequest("send-key-0001"), params());

    expect(repeat.status).toBe(200);
    expect(repeat.headers.get("Idempotent-Replayed")).toBe("true");
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(txEmailAuditCreate).toHaveBeenCalledTimes(1);
    expect(topLevelEmailAuditCreate).not.toHaveBeenCalled();
    expect(topLevelAuditLogCreate).not.toHaveBeenCalled();
    // Scoped to the caller, so two users cannot collide on one key.
    expect(withIdempotency.mock.calls.map((call) => call[1])).toEqual([
      OWNER_ID,
      OWNER_ID,
    ]);
  });
});

describe("POST /api/reports/[id]/send — a good send", () => {
  it("emails the client once with escaped content and a working link, then records EmailAudit + REPORT_SENT in one transaction", async () => {
    const res = await POST(makeRequest(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // Exactly one email, to the client on the report.
    expect(emailSend).toHaveBeenCalledTimes(1);
    const email = emailSend.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
      text?: string;
    };
    expect(email.to).toBe("bob@client.example");
    expect(email.subject).not.toMatch(/[\r\n]/);

    // Every user-supplied value is escaped; nothing hostile survives raw.
    expect(email.html).toContain("Bob &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("12 Harbour St &amp; Co");
    expect(email.html).toContain("Firm A &lt;b&gt;Restoration&lt;/b&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>Restoration</b>");

    // The link is the existing signed, no-login report link for THIS report.
    const match = email.html.match(
      /https:\/\/app\.example\.test\/portal\/insurer\/([A-Za-z0-9_-]+)/,
    );
    expect(match).not.toBeNull();
    const token = match![1];
    expect(verifyInsurerToken(token)).toEqual({ reportId: REPORT_ID });

    // Delivery is recorded in ONE interactive transaction, on the tx client.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txEmailAuditCreate).toHaveBeenCalledTimes(1);
    expect(txEmailAuditCreate.mock.calls[0][0]).toMatchObject({
      data: {
        userId: OWNER_ID,
        reportId: REPORT_ID,
        recipient: "bob@client.example",
        success: true,
      },
    });
    expect(txAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(txAuditLogCreate.mock.calls[0][0]).toMatchObject({
      data: {
        inspectionId: INSPECTION_ID,
        userId: OWNER_ID,
        action: "REPORT_SENT",
        entityType: "Report",
        entityId: REPORT_ID,
      },
    });
    expect(topLevelEmailAuditCreate).not.toHaveBeenCalled();
    expect(topLevelAuditLogCreate).not.toHaveBeenCalled();

    // The bearer token never lands in the audit trail.
    expect(JSON.stringify(txAuditLogCreate.mock.calls[0][0])).not.toContain(
      token,
    );

    // The email goes first; the record is written only after it succeeded.
    expect(emailSend.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.mock.invocationCallOrder[0],
    );
  });
});

describe("POST /api/reports/[id]/send — a failed send", () => {
  it.each([
    [
      "the provider rejects it",
      () =>
        emailSend.mockResolvedValue({
          data: null,
          error: { name: "mailtrap_422", message: "raw provider detail" },
        }),
    ],
    [
      "the sender throws",
      () => emailSend.mockRejectedValue(new Error("raw provider detail")),
    ],
  ])(
    "writes no delivery record and returns a message the UI can show when %s",
    async (_label, arrange) => {
      arrange();

      const res = await POST(makeRequest(), params());
      const json = await res.json();

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(typeof json.error.message).toBe("string");
      expect(json.error.message.length).toBeGreaterThan(0);
      expect(json.error.message).not.toContain("raw provider detail");
      expect(emailSend).toHaveBeenCalledTimes(1);
      expect(transaction).not.toHaveBeenCalled();
      expect(txEmailAuditCreate).not.toHaveBeenCalled();
      expect(txAuditLogCreate).not.toHaveBeenCalled();
      expect(topLevelEmailAuditCreate).not.toHaveBeenCalled();
      expect(topLevelAuditLogCreate).not.toHaveBeenCalled();
    },
  );
});
