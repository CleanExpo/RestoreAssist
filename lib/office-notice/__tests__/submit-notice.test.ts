/**
 * RA-8503: office notice on a submitted job visit.
 *
 * The delivery ledger (deliverEmailOnce) runs for real against an in-memory
 * OutboundEmailDelivery table, so "sent once" is proven by the same code the
 * route uses, not by a stub that always says yes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const ledger = new Map<string, Row>();

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

const mockInspectionFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindMany = vi.fn();
const mockOrgFindUnique = vi.fn();
const mockOrgFindFirst = vi.fn();
const mockNotificationCreateMany = vi.fn().mockResolvedValue({ count: 0 });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: (...a: unknown[]) => mockInspectionFindUnique(...a) },
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
    },
    organization: {
      findUnique: (...a: unknown[]) => mockOrgFindUnique(...a),
      findFirst: (...a: unknown[]) => mockOrgFindFirst(...a),
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

// The row a careless select would return: insured contact details and money
// sit alongside the fields the notice is allowed to use.
const fullInspectionRow = {
  id: "insp-1",
  userId: "owner-1",
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

beforeEach(() => {
  vi.clearAllMocks();
  ledger.clear();
  mockInspectionFindUnique.mockImplementation(async (args: { select?: Row }) =>
    pickSelected(fullInspectionRow, args),
  );
  mockUserFindUnique.mockResolvedValue({
    organizationId: "org-1",
    email: "owner@example.com",
  });
  mockOrgFindUnique.mockResolvedValue({
    id: "org-1",
    ownerId: "owner-1",
    officeNotificationEmail: "office@example.com",
    owner: { email: "owner@example.com" },
  });
  mockOrgFindFirst.mockResolvedValue(null);
  mockUserFindMany.mockResolvedValue([{ id: "admin-1" }, { id: "manager-1" }]);
  mockSend.mockResolvedValue({ data: { id: "msg-1" }, error: null, provider: "mailtrap" });
});

const run = () =>
  notifyOfficeOfSubmittedVisit({
    inspectionId: "insp-1",
    submittedAt: SUBMITTED_AT,
    submitterName: "Signed In Tech",
  });

describe("notifyOfficeOfSubmittedVisit", () => {
  it("notifies the organisation's ADMIN and MANAGER users and the owner once each", async () => {
    await run();

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", role: { in: ["ADMIN", "MANAGER"] } },
      }),
    );
    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(1);
    const rows = mockNotificationCreateMany.mock.calls[0][0].data as Row[];
    expect(rows.map((r) => r.userId).sort()).toEqual(["admin-1", "manager-1", "owner-1"]);
    for (const row of rows) {
      expect(row.title).toBe("Job complete: report ready to send");
      expect(row.link).toBe("/dashboard/inspections/insp-1");
    }
  });

  it("sends one email to the office address with job number, address, technician and link", async () => {
    await run();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const email = mockSend.mock.calls[0][0] as Row;
    expect(email.to).toBe("office@example.com");
    const body = `${email.subject}\n${email.html}\n${email.text}`;
    expect(body).toContain("NIR-2026-11-0042");
    expect(body).toContain("12 Sample Street, Parramatta NSW 2150");
    expect(body).toContain("Sam Field");
    expect(body).toContain("/dashboard/inspections/insp-1");
    expect(String(email.subject)).toContain("report ready to send");
  });

  it("falls back to the owner's email when no office address is set", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      ownerId: "owner-1",
      officeNotificationEmail: null,
      owner: { email: "owner@example.com" },
    });
    await run();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("owner@example.com");
  });

  it("never carries insured contact details or money", async () => {
    await run();

    const select = mockInspectionFindUnique.mock.calls[0][0].select as Row;
    expect(Object.keys(select).sort()).toEqual(
      ["id", "inspectionNumber", "propertyAddress", "technicianName", "userId"].sort(),
    );
    const email = mockSend.mock.calls[0][0] as Row;
    const notice = mockNotificationCreateMany.mock.calls[0][0].data[0] as Row;
    const everything = [email.subject, email.html, email.text, notice.title, notice.message].join("\n");
    for (const banned of ["Jane Insured", "0400 111 222", "jane.insured@example.com", "4321", "$"]) {
      expect(everything).not.toContain(banned);
    }
  });

  it("sends nothing more when the same submit is notified twice", async () => {
    await run();
    await run();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const row = ledger.get(submitNoticeEmailKey("insp-1", SUBMITTED_AT));
    expect(row?.status).toBe("SENT");
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

  it("never throws when the provider fails", async () => {
    mockSend.mockRejectedValue(new Error("provider down"));
    await expect(run()).resolves.toBeUndefined();
  });
});
