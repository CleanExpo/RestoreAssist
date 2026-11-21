/**
 * RA-8497: the technician's notice for a booked site visit.
 *
 * The delivery ledger (deliverEmailOnce) runs for real against an in-memory
 * OutboundEmailDelivery table, as in the RA-8503 office-notice test, so "sent
 * once" is proven by the code the route uses. The calendar file is parsed with
 * ical.js, not read back by our own generator.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ICAL from "ical.js";

type Row = Record<string, unknown>;
const ledger = new Map<string, Row>();

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

const mockAppointmentFindUnique = vi.fn();
const mockOrgFindUnique = vi.fn();
const mockNotificationCreate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobAppointment: {
      findUnique: (...a: unknown[]) => mockAppointmentFindUnique(...a),
    },
    organization: {
      findUnique: (...a: unknown[]) => mockOrgFindUnique(...a),
    },
    notification: {
      create: (...a: unknown[]) => mockNotificationCreate(...a),
    },
    outboundEmailDelivery: {
      create: async ({ data }: { data: Row }) => {
        const key = data.idempotencyKey as string;
        if (ledger.has(key))
          throw Object.assign(new Error("unique"), { code: "P2002" });
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

const mockReportError = vi.fn();
vi.mock("@/lib/observability", () => ({
  reportError: (...a: unknown[]) => mockReportError(...a),
}));

vi.mock("@/lib/app-url", () => ({
  getAppUrl: () => "https://app.example.test",
}));

import {
  appointmentNoticeEmailKey,
  notifyTechnicianOfBooking,
} from "../appointment-notice";

const ADDRESS = "14 Harbour Street, Wollongong NSW 2500";
const INSURED = "Margaret Insured";
const NOTE = `Call ${INSURED} on 0400 111 222 before arriving; key under the mat at ${ADDRESS}.`;

// What a careless select would return: the address and the insured's
// details sit next to the fields the notice may use.
function appointmentRow(overrides: Row = {}) {
  return {
    id: "appt-1",
    title: "Re-attendance",
    startsAt: new Date("2026-01-14T22:00:00.000Z"),
    endsAt: new Date("2026-01-15T00:00:00.000Z"),
    status: "SCHEDULED",
    notes: NOTE,
    assignedUserId: "tech-1",
    inspection: {
      id: "insp-1",
      inspectionNumber: "NIR-2026-01-0042",
      propertyAddress: ADDRESS,
      clientName: INSURED,
    },
    assignedUser: {
      id: "tech-1",
      email: "tech@example.test",
      name: "Sam Tech",
      organizationId: "org-1",
    },
    ...overrides,
  };
}

beforeEach(() => {
  ledger.clear();
  mockAppointmentFindUnique.mockReset();
  mockOrgFindUnique.mockReset();
  mockNotificationCreate.mockReset().mockResolvedValue({});
  mockSend.mockReset().mockResolvedValue({ data: { id: "mt-1" }, error: null });
  mockReportError.mockReset();
  mockAppointmentFindUnique.mockResolvedValue(appointmentRow());
  mockOrgFindUnique.mockResolvedValue({
    timezone: "Australia/Sydney",
    country: "AU",
  });
});

afterEach(() => {
  ICAL.TimezoneService.reset();
});

function sentEmail() {
  expect(mockSend).toHaveBeenCalledTimes(1);
  return mockSend.mock.calls[0][0] as {
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments: Array<{ filename: string; content: string; contentType: string }>;
    idempotencyKey: string;
  };
}

function attachedIcs(email: ReturnType<typeof sentEmail>): string {
  expect(email.attachments).toHaveLength(1);
  const [file] = email.attachments;
  expect(file.filename).toMatch(/\.ics$/);
  expect(file.contentType).toBe("text/calendar");
  return Buffer.from(file.content, "base64").toString("utf8");
}

describe("notifyTechnicianOfBooking", () => {
  it("reads the booking through a fixed select that leaves out the address and the insured", async () => {
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    const { select } = mockAppointmentFindUnique.mock.calls[0][0];
    expect(select.inspection.select).toEqual({ id: true, inspectionNumber: true });
    expect(JSON.stringify(select)).not.toMatch(/address|client|insured|phone/i);
  });

  it("gives the technician one in-app notice carrying the office's note and a job link", async () => {
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const { data } = mockNotificationCreate.mock.calls[0][0];
    expect(data.userId).toBe("tech-1");
    expect(data.link).toBe("/dashboard/inspections/insp-1");
    expect(data.message).toContain(NOTE);
    expect(data.message).toContain("NIR-2026-01-0042");
    expect(data.message).toMatch(/Thursday 15 January 2026, 9:00\s?am/i);
  });

  it("emails the technician once, with a calendar file at the organisation's wall-clock", async () => {
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    const email = sentEmail();
    expect(email.to).toBe("tech@example.test");
    expect(email.idempotencyKey).toBe(appointmentNoticeEmailKey("appt-1"));
    expect(email.subject).toContain("NIR-2026-01-0042");
    expect(email.text).toMatch(/Thursday 15 January 2026, 9:00\s?am to 11:00\s?am/i);
    expect(email.text).toContain(
      "https://app.example.test/dashboard/inspections/insp-1",
    );

    const root = new ICAL.Component(ICAL.parse(attachedIcs(email)));
    for (const vtz of root.getAllSubcomponents("vtimezone")) {
      ICAL.TimezoneService.register(vtz);
    }
    const event = new ICAL.Event(root.getFirstSubcomponent("vevent")!);
    expect(event.startDate.zone?.tzid).toBe("Australia/Sydney");
    expect(event.startDate.toString()).toBe("2026-01-15T09:00:00");
    expect(event.endDate.toString()).toBe("2026-01-15T11:00:00");
    expect(event.startDate.toJSDate().toISOString()).toBe(
      "2026-01-14T22:00:00.000Z",
    );
    expect(event.uid).toBe("job-appointment-appt-1@restoreassist");
    expect(event.summary).toContain("Re-attendance");
  });

  it("uses the technician's organisation timezone, Perth here", async () => {
    mockOrgFindUnique.mockResolvedValue({
      timezone: "Australia/Perth",
      country: "AU",
    });
    mockAppointmentFindUnique.mockResolvedValue(
      appointmentRow({
        startsAt: new Date("2026-07-15T01:00:00.000Z"),
        endsAt: new Date("2026-07-15T03:00:00.000Z"),
      }),
    );
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    const email = sentEmail();
    expect(email.text).toMatch(/Wednesday 15 July 2026, 9:00\s?am/i);
    const ics = attachedIcs(email);
    expect(ics).toContain("DTSTART;TZID=Australia/Perth:20260715T090000");
  });

  it("an invalid organisation timezone falls back to Sydney and still sends", async () => {
    mockOrgFindUnique.mockResolvedValue({ timezone: "Not/AZone", country: "AU" });
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    const ics = attachedIcs(sentEmail());
    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20260115T090000");
  });

  it("the email and the calendar file carry no address, insured details or note", async () => {
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    const email = sentEmail();
    const everything = [
      email.subject,
      email.html,
      email.text,
      attachedIcs(email),
    ].join("\n");
    for (const secret of [ADDRESS, "Harbour Street", INSURED, "0400 111 222", "key under the mat"]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("escapes the typed title in the email HTML", async () => {
    mockAppointmentFindUnique.mockResolvedValue(
      appointmentRow({ title: `<img src=x onerror="alert(1)">` }),
    );
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    const email = sentEmail();
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });

  it("a second call for the same booking sends no second email", async () => {
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(ledger.get(appointmentNoticeEmailKey("appt-1"))?.status).toBe("SENT");
  });

  it("sends nothing for a booking with no technician", async () => {
    mockAppointmentFindUnique.mockResolvedValue(
      appointmentRow({ assignedUserId: null, assignedUser: null }),
    );
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends nothing for a booking cancelled before the notice ran, or one that is gone", async () => {
    mockAppointmentFindUnique.mockResolvedValueOnce(
      appointmentRow({ status: "CANCELLED" }),
    );
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    mockAppointmentFindUnique.mockResolvedValueOnce(null);
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("still gives the in-app notice when the technician has no usable email", async () => {
    mockAppointmentFindUnique.mockResolvedValue(
      appointmentRow({
        assignedUser: {
          id: "tech-1",
          email: "not-an-email",
          name: "Sam Tech",
          organizationId: "org-1",
        },
      }),
    );
    await notifyTechnicianOfBooking({ appointmentId: "appt-1" });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("never throws: a failed send is reported without the recipient address", async () => {
    mockSend.mockRejectedValue(new Error("provider down"));
    await expect(
      notifyTechnicianOfBooking({ appointmentId: "appt-1" }),
    ).resolves.toBeUndefined();
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockReportError.mock.calls[0][1])).not.toContain(
      "tech@example.test",
    );
  });

  it("never throws when the booking cannot be read", async () => {
    mockAppointmentFindUnique.mockRejectedValue(new Error("db down"));
    await expect(
      notifyTechnicianOfBooking({ appointmentId: "appt-1" }),
    ).resolves.toBeUndefined();
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });
});
