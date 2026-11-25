/**
 * RA-8498: deleting a photograph's evidence record removes the counted
 * InspectionPhoto row in the same transaction (RA-8388). When that photo row
 * is a site visit's front-of-property photo, the delete is refused with 409
 * and BOTH rows stay: the evidence record is not removed while the photo it
 * backs is still in use.
 *
 * Same rollback-capable transaction mock as route.delete-photo.test.ts, with
 * a SiteVisit table added.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { expectRefused } from "@/tests/helpers/expect-refused";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  evidence: [] as Array<Record<string, unknown>>,
  photos: [] as Array<Record<string, unknown>>,
  visits: [] as Array<Record<string, unknown>>,
  getServerSession: vi.fn(),
  assertInspectionAssignedWrite: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: state.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
  assertInspectionCaptureWrite: vi.fn(),
  assertInspectionAssignedWrite: state.assertInspectionAssignedWrite,
}));

vi.mock("@/lib/prisma", () => {
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      if (key === "inspection") return true;
      if (value && typeof value === "object" && "not" in (value as Row)) {
        return row[key] !== (value as Row).not;
      }
      return row[key] === value;
    });

  const client = (evidence: Row[], photos: Row[], visits: Row[]) => ({
    evidenceItem: {
      findFirst: async ({ where }: { where: Row }) => {
        const found = evidence.find((row) => matches(row, where));
        return found ? { ...found, moistureReading: null, environmentalData: null } : null;
      },
      count: async ({ where }: { where: Row }) => evidence.filter((row) => matches(row, where)).length,
      delete: async ({ where }: { where: Row }) => {
        const index = evidence.findIndex((row) => matches(row, where));
        if (index === -1) throw new Error("Record to delete does not exist.");
        return evidence.splice(index, 1)[0];
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = evidence.length;
        for (let i = evidence.length - 1; i >= 0; i -= 1) {
          if (matches(evidence[i], where)) evidence.splice(i, 1);
        }
        return { count: before - evidence.length };
      },
    },
    inspectionPhoto: {
      deleteMany: async ({ where }: { where: Row }) => {
        const doomed = photos.filter((row) => matches(row, where)).map((row) => row.id);
        // The NO ACTION key: a photo still named by a visit cannot go.
        if (visits.some((v) => doomed.includes(v.frontPhotoId))) {
          throw Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" });
        }
        const before = photos.length;
        for (let i = photos.length - 1; i >= 0; i -= 1) {
          if (matches(photos[i], where)) photos.splice(i, 1);
        }
        return { count: before - photos.length };
      },
    },
    siteVisit: {
      findMany: async ({ where }: { where: { inspectionId: string; frontPhoto: { url: string } } }) =>
        visits
          .filter(
            (v) =>
              v.inspectionId === where.inspectionId &&
              photos.some((p) => p.id === v.frontPhotoId && p.url === where.frontPhoto.url),
          )
          .map((v) => ({ visitNumber: v.visitNumber })),
    },
    auditLog: { create: state.auditCreate },
  });

  return {
    prisma: {
      ...client(state.evidence, state.photos, state.visits),
      $transaction: async (fn: (tx: ReturnType<typeof client>) => Promise<unknown>) => {
        const evidence = state.evidence.map((row) => ({ ...row }));
        const photos = state.photos.map((row) => ({ ...row }));
        const result = await fn(client(evidence, photos, state.visits));
        state.evidence.splice(0, state.evidence.length, ...evidence);
        state.photos.splice(0, state.photos.length, ...photos);
        return result;
      },
    },
  };
});

import { DELETE } from "../route";

const URL_A = "https://storage/evidence/a-compressed.jpg";

const remove = () =>
  DELETE(
    new NextRequest("http://localhost/api/inspections/insp_1/evidence", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId: "ev_photo" }),
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );

function seed(visits: Row[]) {
  state.evidence.splice(0, state.evidence.length, {
    id: "ev_photo",
    inspectionId: "insp_1",
    evidenceClass: "PHOTO_DAMAGE",
    fileUrl: URL_A,
    capturedById: "user_1",
  });
  state.photos.splice(0, state.photos.length, { id: "ph_1", inspectionId: "insp_1", url: URL_A });
  state.visits.splice(0, state.visits.length, ...visits);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe.each([
  ["owner", false],
  ["assigned technician", true],
])("evidence DELETE by the %s", (_who, viaAssignment) => {
  beforeEach(() => {
    state.assertInspectionAssignedWrite.mockResolvedValue({
      ok: true,
      data: { viaAssignment, childInspectionFilter: undefined },
    });
  });

  it("refuses 409 and keeps both rows when the photo is a visit's front photo", async () => {
    seed([{ id: "v1", inspectionId: "insp_1", visitNumber: 1, frontPhotoId: "ph_1" }]);
    const res = await remove();
    await expectRefused(res, 409, /front of property photo for visit 1/);
    expect(state.evidence).toHaveLength(1);
    expect(state.photos).toHaveLength(1);
    expect(state.auditCreate).not.toHaveBeenCalled();
  });

  it("deletes both rows as before when no visit uses the photo", async () => {
    seed([]);
    const res = await remove();
    expect(res.status).toBe(200);
    expect(state.evidence).toHaveLength(0);
    expect(state.photos).toHaveLength(0);
  });
});
