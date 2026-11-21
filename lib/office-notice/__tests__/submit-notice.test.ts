/**
 * RA-8503: office notice on a submitted job visit.
 *
 * The delivery ledger (deliverEmailOnce) runs for real against an in-memory
 * OutboundEmailDelivery table, so "sent once" is proven by the same code the
 * route uses, not by a stub that always says yes. The job's tenant comes from
 * getResourceTenant, mocked here with the shapes it really returns: the
 * creator themself for an owner-created job, or a proven organisation for a
 * member's (or removed member's) job.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const ledger = new Map<string, Row>();

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

const mockInspectionFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindMany = vi.fn();
const mockOrgFindUnique = vi.fn();
const mockOrgFindMany = vi.fn();
const mockNotificationCreateMany = vi.fn().mockResolvedValue({ count: 0 });
const mockGetResourceTenant = vi.fn();

vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: (...a: unknown[]) => mockGetResourceTenant(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: (...a: unknown[]) => mockInspectionFindUnique(...a) },
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
    },
    organization: {
      findUnique: (...a: unknown[]) => mockOrgFindUnique(...a),
      findMany: (...a: unknown[]) => mockOrgFindMany(...a),
    },
    notification: {
      createMany: (...a: unknown[]) => mockNotificationCreateMany(...a),
    },
    outboundEmailDelivery: {
      create: async ({ data }: { data: Row }) => {
        const key = data.idempotencyKey as string;
        if (ledger.has(key)) throw Object.assign(new Error("unique"), { code: "P2002" });
        ledger.set(key, { ...data });
        return data;
      },
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        ledger.get(where.idempotencyKey) ?? null,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const [key, row] of ledger) {
          if (matches(row, where)) {
            ledger.set(key, { ...row, ...data });
            count++;
          }
        }
        return { count };
      },
    },
  },
}));

const mockSend = vi.fn();
vi.mock("@/lib/email/send-transactional", () => ({
  EMAIL_SEND_TIMEOUT_MS: 10_000,
  sendTransactionalEmail: (...a: unknown[]) => mockSend(...a),
}));

import {
  notifyOfficeOfSubmittedVisit,
  submitNoticeEmailKey,
} from "../submit-notice";

const SUBMITTED_AT = new Date("2026-11-21T01:00:00.000Z");
const CREATED_AT = new Date("2026-11-01T00:00:00.000Z");

// The row a careless select would return: the property address, insured
// contact details and money sit alongside the fields the notice may use.
const fullInspectionRow = {
  id: "insp-1",
  userId: "owner-1",
  createdAt: CREATED_AT,
  inspectionNumber: "NIR-2026-11-0042",
  propertyAddress: "12 Sample Street, Parramatta NSW 2150",
  technicianName: "Sam Field",
  clientName: "Jane Insured",
  clientPhone: "0400 111 222",
  clientEmail: "jane.insured@example.com",
  totalCost: 4321.99,
};

function pickSelected(row: Row, args: { select?: Row }): Row {
  if (!args.select) return row;
  return Object.fromEntries(
    Object.keys(args.select).filter((k) => args.select![k]).map((k) => [k, row[k]]),
  );
}

const ORG_1 = {
  id: "org-1",
  ownerId: "owner-1",
  email: "office@example.com",
  owner: { email: "owner@example.com" },
};

let infoSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  ledger.clear();
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  mockInspectionFindUnique.mockImplementation(async (args: { select?: Row }) =>
    pickSelected(fullInspectionRow, args),
  );
  // An owner-created job: getResourceTenant returns the creator themself.
  mockGetResourceTenant.mockResolvedValue({ ownerId: "owner-1", organizationId: null });
  mockOrgFindMany.mockResolvedValue([ORG_1]);
  mockOrgFindUnique.mockResolvedValue(null);
  mockUserFindUnique.mockResolvedValue({ email: "owner@example.com" });
  mockUserFindMany.mockResolvedValue([{ id: "admin-1" }, { id: "manager-1" }]);
  mockSend.mockResolvedValue({ data: { id: "msg-1" }, error: null, provider: "mailtrap" });
});

afterEach(() => {
  infoSpy.mockRestore();
  errorSpy.mockRestore();
});

const run = () =>
  notifyOfficeOfSubmittedVisit({
    inspectionId: "insp-1",
    submittedAt: SUBMITTED_AT,
    submitterName: "Signed In Tech",
  });

function inAppRecipients(): string[] {
  const rows = mockNotificationCreateMany.mock.calls[0][0].data as Row[];
  return rows.map((r) => r.userId as string).sort();
}

function outcomes(): string[] {
  return infoSpy.mock.calls
    .filter((c) => c[0] === "[office-notice]")
    .map((c) => (c[1] as { outcome: string }).outcome);
}

describe("notifyOfficeOfSubmittedVisit", () => {
  it("resolves the job's tenant from its creator and creation time", async () => {
    await run();
    expect(mockGetResourceTenant).toHaveBeenCalledWith("owner-1", CREATED_AT);
  });

  it("notifies the organisation's ADMIN and MANAGER users and the owner once each", async () => {
    await run();

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", role: { in: ["ADMIN", "MANAGER"] } },
      }),
    );
    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(1);
    expect(inAppRecipients()).toEqual(["admin-1", "manager-1", "owner-1"]);
    const rows = mockNotificationCreateMany.mock.calls[0][0].data as Row[];
    for (const row of rows) {
      expect(row.title).toBe("Job complete: report ready to send");
      expect(row.link).toBe("/dashboard/inspections/insp-1");
    }
  });

  it("sends one email to the office address with job number, technician and link", async () => {
    await run();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const email = mockSend.mock.calls[0][0] as Row;
    expect(email.to).toBe("office@example.com");
    const body = `${email.subject}\n${email.html}\n${email.text}`;
    expect(body).toContain("NIR-2026-11-0042");
    expect(body).toContain("Sam Field");
    expect(body).toContain("/dashboard/inspections/insp-1");
    expect(String(email.subject)).toContain("report ready to send");
    expect(outcomes()).toEqual(["sent"]);
  });

  it("falls back to the owner's email when no office address is set", async () => {
    mockOrgFindMany.mockResolvedValue([{ ...ORG_1, email: null }]);
    await run();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("owner@example.com");
  });

  it("falls back to the owner's email when the saved office address is not valid", async () => {
    mockOrgFindMany.mockResolvedValue([{ ...ORG_1, email: "front desk" }]);
    await run();
    expect(mockSend.mock.calls[0][0].to).toBe("owner@example.com");
  });

  it("never carries the property address, insured contact details or money", async () => {
    await run();

    const select = mockInspectionFindUnique.mock.calls[0][0].select as Row;
    expect(Object.keys(select).sort()).toEqual(
      ["createdAt", "id", "inspectionNumber", "technicianName", "userId"].sort(),
    );
    const email = mockSend.mock.calls[0][0] as Row;
    const notice = mockNotificationCreateMany.mock.calls[0][0].data[0] as Row;
    const everything = [email.subject, email.html, email.text, notice.title, notice.message].join("\n");
    for (const banned of [
      "12 Sample Street",
      "Jane Insured",
      "0400 111 222",
      "jane.insured@example.com",
      "4321",
      "$",
    ]) {
      expect(everything).not.toContain(banned);
    }
  });

  it("deduplicates the email when the same submit is notified twice; in-app relies on the route CAS", async () => {
    await run();
    await run();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const row = ledger.get(submitNoticeEmailKey("insp-1", SUBMITTED_AT));
    expect(row?.status).toBe("SENT");
    expect(outcomes()).toEqual(["sent", "replayed"]);
    // The in-app write has no key of its own; only the route's winning CAS
    // keeps it single (proven in the route's office-notice test).
    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(2);
  });

  it("a later, separate submit of the same job is a new notice", async () => {
    await run();
    await notifyOfficeOfSubmittedVisit({
      inspectionId: "insp-1",
      submittedAt: new Date("2026-11-22T01:00:00.000Z"),
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("uses the submitter's name when the job has no technician recorded", async () => {
    mockInspectionFindUnique.mockImplementation(async (args: { select?: Row }) =>
      pickSelected({ ...fullInspectionRow, technicianName: null }, args),
    );
    await run();
    expect(String(mockSend.mock.calls[0][0].text)).toContain("Signed In Tech");
  });

  it("never throws when the provider fails, and reports it in the alert-ready format", async () => {
    mockSend.mockRejectedValue(new Error("provider down"));
    await expect(run()).resolves.toBeUndefined();
    expect(outcomes()).toEqual(["failed"]);
    const reported = errorSpy.mock.calls.find((c) => c[0] === "[error]");
    expect(reported).toBeDefined();
    const payload = JSON.parse(String(reported![1])) as Row;
    expect(payload.stage).toBe("office-notice");
    expect(payload.inspectionId).toBe("insp-1");
    expect(payload.ledgerState).toBe("AMBIGUOUS");
    expect(payload.ledgerKey).toBe(submitNoticeEmailKey("insp-1", SUBMITTED_AT));
    expect(String(reported![1])).not.toContain("office@example.com");
  });

  describe("tenancy", () => {
    it("a removed member's old job tells the business that owns it, never the removed member", async () => {
      mockInspectionFindUnique.mockImplementation(async (args: { select?: Row }) =>
        pickSelected({ ...fullInspectionRow, userId: "tech-T" }, args),
      );
      mockGetResourceTenant.mockResolvedValue({ ownerId: "owner-X", organizationId: "org-X" });
      mockOrgFindUnique.mockResolvedValue({
        id: "org-X",
        ownerId: "owner-X",
        email: "office@business-x.example",
        owner: { email: "owner@business-x.example" },
      });
      mockUserFindMany.mockResolvedValue([{ id: "admin-X" }]);

      await run();

      expect(mockOrgFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "org-X" } }),
      );
      expect(inAppRecipients()).toEqual(["admin-X", "owner-X"]);
      expect(mockSend.mock.calls[0][0].to).toBe("office@business-x.example");
      for (const call of mockUserFindMany.mock.calls) {
        expect(call[0].where.organizationId).toBe("org-X");
      }
    });

    it("no proven tenant tells nobody", async () => {
      mockGetResourceTenant.mockResolvedValue(null);
      await run();
      expect(mockNotificationCreateMany).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
      expect(outcomes()).toEqual(["no_tenant"]);
    });

    it("an organisation whose owner is not the tenant's owner is not used", async () => {
      mockGetResourceTenant.mockResolvedValue({ ownerId: "owner-X", organizationId: "org-Y" });
      mockOrgFindUnique.mockResolvedValue({
        id: "org-Y",
        ownerId: "owner-Y",
        email: "office@business-y.example",
        owner: { email: "owner@business-y.example" },
      });
      mockUserFindUnique.mockResolvedValue({ email: "owner@business-x.example" });

      await run();

      expect(mockUserFindMany).not.toHaveBeenCalled();
      expect(inAppRecipients()).toEqual(["owner-X"]);
      expect(mockSend.mock.calls[0][0].to).toBe("owner@business-x.example");
    });

    it("a sole trader with no organisation tells the owner in-app and by email", async () => {
      mockOrgFindMany.mockResolvedValue([]);
      await run();
      expect(mockUserFindMany).not.toHaveBeenCalled();
      expect(inAppRecipients()).toEqual(["owner-1"]);
      expect(mockUserFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "owner-1" } }),
      );
      expect(mockSend.mock.calls[0][0].to).toBe("owner@example.com");
    });

    it("an owner of several organisations is not guessed into one", async () => {
      mockOrgFindMany.mockResolvedValue([ORG_1, { ...ORG_1, id: "org-2" }]);
      await run();
      expect(mockUserFindMany).not.toHaveBeenCalled();
      expect(inAppRecipients()).toEqual(["owner-1"]);
      expect(mockSend.mock.calls[0][0].to).toBe("owner@example.com");
    });

    it("no usable address sends no email but still tells the owner in-app", async () => {
      mockOrgFindMany.mockResolvedValue([{ ...ORG_1, email: null, owner: { email: null } }]);
      await run();
      expect(mockSend).not.toHaveBeenCalled();
      expect(inAppRecipients()).toEqual(["admin-1", "manager-1", "owner-1"]);
      expect(outcomes()).toEqual(["no_recipient"]);
    });
  });
});
