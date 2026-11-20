/**
 * RA-8388 AMENDMENT 05 - deleting the evidence record behind a counted reading.
 *
 * A signed moisture or ambient capture writes two rows: the evidence record
 * and the reading the completion gate counts. Before this amendment the
 * evidence record could be deleted on its own, leaving a counted, printed
 * reading with nothing to cite. Both delete branches (the owner's, and the
 * assigned technician's) now refuse in words.
 *
 * The database is mocked, so this proves the route's answer. That the
 * database itself refuses the delete (ON DELETE NO ACTION) is proved on a
 * real database in lib/evidence/__tests__/authoritative-link.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  assertInspectionAssignedWrite: vi.fn(),
  findFirst: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: db.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
  assertInspectionCaptureWrite: vi.fn(),
  assertInspectionAssignedWrite: db.assertInspectionAssignedWrite,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    evidenceItem: {
      findFirst: db.findFirst,
      delete: db.deleteOne,
      deleteMany: db.deleteMany,
    },
    auditLog: { create: db.auditCreate },
  },
}));

import { DELETE } from "../route";

function remove() {
  return DELETE(
    new NextRequest("http://localhost/api/inspections/insp_1/evidence", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId: "ev_1" }),
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

const asOwner = () =>
  db.assertInspectionAssignedWrite.mockResolvedValue({
    ok: true,
    data: { viaAssignment: false, childInspectionFilter: undefined },
  });
const asAssignedTechnician = () =>
  db.assertInspectionAssignedWrite.mockResolvedValue({
    ok: true,
    data: { viaAssignment: true, childInspectionFilter: undefined },
  });

const nothingDeleted = () => {
  expect(db.deleteOne).not.toHaveBeenCalled();
  expect(db.deleteMany).not.toHaveBeenCalled();
  expect(db.auditCreate).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  db.deleteOne.mockResolvedValue({ id: "ev_1" });
  db.deleteMany.mockResolvedValue({ count: 1 });
});

describe("DELETE evidence that backs a counted reading", () => {
  it("the owner cannot delete the record behind a moisture reading", async () => {
    asOwner();
    db.findFirst.mockResolvedValue({
      id: "ev_1",
      moistureReading: { id: "mr_1" },
      environmentalData: null,
    });

    const response = await remove();

    expect(response.status).toBe(409);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("signed record behind a moisture reading");
    // Where to go, in words that match the screens that exist.
    expect(text).toContain("Guided Capture");
    expect(text).toContain("Moisture tab");
    expect(text).not.toContain("invalidate");
    nothingDeleted();
  });

  it("the owner cannot delete the record behind an ambient reading", async () => {
    asOwner();
    db.findFirst.mockResolvedValue({
      id: "ev_1",
      moistureReading: null,
      environmentalData: { id: "env_1" },
    });

    const response = await remove();

    expect(response.status).toBe(409);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("signed record behind an ambient reading");
    // No screen retires an ambient reading, so the refusal must not send
    // anyone looking for one.
    expect(text).not.toContain("Moisture tab");
    expect(text).not.toContain("invalidate");
    nothingDeleted();
  });

  it("the assigned technician cannot delete it either", async () => {
    asAssignedTechnician();
    db.findFirst.mockResolvedValue({
      id: "ev_1",
      moistureReading: { id: "mr_1" },
      environmentalData: null,
    });

    const response = await remove();

    expect(response.status).toBe(409);
    nothingDeleted();
  });

  it("asks about the link in the same query that proves the caller may see the record", async () => {
    asOwner();
    db.findFirst.mockResolvedValue({
      id: "ev_1",
      moistureReading: null,
      environmentalData: null,
    });

    await remove();

    expect(db.findFirst).toHaveBeenCalledTimes(1);
    expect(db.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "ev_1", inspectionId: "insp_1" }),
        include: {
          moistureReading: { select: { id: true } },
          environmentalData: { select: { id: true } },
        },
      }),
    );
  });

  it("evidence that backs no reading still deletes for the owner", async () => {
    // A photo, a note, an equipment log: nothing counts on it, so the rule
    // does not reach it.
    asOwner();
    db.findFirst.mockResolvedValue({
      id: "ev_1",
      moistureReading: null,
      environmentalData: null,
    });

    const response = await remove();

    expect(response.status).toBe(200);
    expect(db.deleteOne).toHaveBeenCalledTimes(1);
  });

  it("evidence that backs no reading still deletes for the assigned technician, with its custody record", async () => {
    asAssignedTechnician();
    db.findFirst.mockResolvedValue({
      id: "ev_1",
      moistureReading: null,
      environmentalData: null,
    });

    const response = await remove();

    expect(response.status).toBe(200);
    expect(db.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("logs the refusal with a fixed tag, so a refused delete can be found afterwards", async () => {
    // RA-8388 bench round 1: the 409 reached the browser and nothing else. A
    // technician who reports "it would not let me delete it" could not be
    // matched to a request.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      asOwner();
      db.findFirst.mockResolvedValue({
        id: "ev_1",
        evidenceClass: "MOISTURE_READING",
        moistureReading: { id: "mr_1" },
        environmentalData: null,
      });

      const response = await remove();

      expect(response.status).toBe(409);
      const calls = warnSpy.mock.calls.filter(
        ([tag]) => tag === "[evidence] signed-row-refused",
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({
        inspectionId: "insp_1",
        evidenceId: "ev_1",
        table: "moistureReading",
      });
    } finally {
      warnSpy.mockRestore();
    }
  });
});
