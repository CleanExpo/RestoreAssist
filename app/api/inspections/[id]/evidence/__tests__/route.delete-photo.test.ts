/**
 * RA-8388 bench round 1: deleting a photograph's evidence record must stop
 * the photograph being counted.
 *
 * The capture route writes two rows for a photograph: the evidence record
 * and the `InspectionPhoto` the submit gate counts. `InspectionPhoto` has no
 * column pointing back at the evidence record, so the DELETE removed the
 * evidence and left the photograph counted: a technician who uploaded a
 * photograph of the wrong property and deleted it still passed "has
 * photographs", on a photograph with no chain of custody.
 *
 * Without a migration, the only join is the one both writers already share:
 * the photo row's `url` is the evidence record's `fileUrl`. The delete
 * removes that row in the SAME transaction.
 *
 * The database is mocked with a transaction that can roll back, so "same
 * transaction" is a real assertion and not two creates that both succeeded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  evidence: [] as Array<Record<string, unknown>>,
  photos: [] as Array<Record<string, unknown>>,
  failPhotoDelete: false,
  transactionOptions: [] as unknown[],
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
      // Prisma ignores a filter whose value is `undefined`: `{ id: undefined }`
      // matches every row. The mock must do the same, or a request with no
      // identifier looks harmless here and removes everything in production.
      if (value === undefined) return true;
      if (key === "inspection") return true; // tenancy filter: not modelled
      if (key === "NOT") return !matches(row, value as Row);
      if (value && typeof value === "object" && "not" in (value as Row)) {
        return row[key] !== (value as Row).not;
      }
      return row[key] === value;
    });

  const client = (evidence: Row[], photos: Row[]) => ({
    evidenceItem: {
      findFirst: async ({ where }: { where: Row }) => {
        const found = evidence.find((row) => matches(row, where));
        return found
          ? { ...found, moistureReading: null, environmentalData: null }
          : null;
      },
      count: async ({ where }: { where: Row }) =>
        evidence.filter((row) => matches(row, where)).length,
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
        if (state.failPhotoDelete) {
          throw new Error("simulated failure deleting InspectionPhoto");
        }
        const before = photos.length;
        for (let i = photos.length - 1; i >= 0; i -= 1) {
          if (matches(photos[i], where)) photos.splice(i, 1);
        }
        return { count: before - photos.length };
      },
    },
    // RA-8498: no site visit uses the photo (front-photo-delete.test.ts covers the refusal).
    siteVisit: { findMany: async () => [] },
    auditLog: { create: state.auditCreate },
  });

  return {
    prisma: {
      ...client(state.evidence, state.photos),
      // Works on copies and only writes them back when the callback
      // returns, so a throw part way through leaves both tables untouched.
      $transaction: async (
        fn: (tx: ReturnType<typeof client>) => Promise<unknown>,
        options?: unknown,
      ) => {
        state.transactionOptions.push(options);
        const evidence = state.evidence.map((row) => ({ ...row }));
        const photos = state.photos.map((row) => ({ ...row }));
        const result = await fn(client(evidence, photos));
        state.evidence.splice(0, state.evidence.length, ...evidence);
        state.photos.splice(0, state.photos.length, ...photos);
        return result;
      },
    },
  };
});

import { DELETE } from "../route";

const URL_A = "https://storage/evidence/a-compressed.jpg";

function remove(evidenceId = "ev_photo") {
  return DELETE(
    new NextRequest("http://localhost/api/inspections/insp_1/evidence", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId }),
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

const asOwner = () =>
  state.assertInspectionAssignedWrite.mockResolvedValue({
    ok: true,
    data: { viaAssignment: false, childInspectionFilter: undefined },
  });
const asAssignedTechnician = () =>
  state.assertInspectionAssignedWrite.mockResolvedValue({
    ok: true,
    data: { viaAssignment: true, childInspectionFilter: undefined },
  });

function seed(evidence: Row[], photos: Row[]) {
  state.evidence.splice(0, state.evidence.length, ...evidence);
  state.photos.splice(0, state.photos.length, ...photos);
}

const photoEvidence = (overrides: Row = {}): Row => ({
  id: "ev_photo",
  inspectionId: "insp_1",
  evidenceClass: "PHOTO_DAMAGE",
  fileUrl: URL_A,
  capturedById: "user_1",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.failPhotoDelete = false;
  state.transactionOptions.length = 0;
  state.getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("DELETE of a photograph's evidence record", () => {
  it("the owner's delete removes the counted photograph row as well", async () => {
    asOwner();
    seed(
      [photoEvidence()],
      [
        { id: "ph_1", inspectionId: "insp_1", url: URL_A },
        // Another photograph on the same job, and the same URL on another
        // job: neither belongs to this evidence record.
        { id: "ph_2", inspectionId: "insp_1", url: "https://storage/other.jpg" },
        { id: "ph_3", inspectionId: "insp_OTHER", url: URL_A },
      ],
    );

    const response = await remove();

    expect(response.status).toBe(200);
    expect(state.evidence).toHaveLength(0);
    expect(state.photos.map((row) => row.id)).toEqual(["ph_2", "ph_3"]);
  });

  it("the assigned technician's delete removes it too, and keeps the custody record", async () => {
    asAssignedTechnician();
    seed(
      [photoEvidence()],
      [{ id: "ph_1", inspectionId: "insp_1", url: URL_A }],
    );

    const response = await remove();

    expect(response.status).toBe(200);
    expect(state.evidence).toHaveLength(0);
    expect(state.photos).toHaveLength(0);
    expect(state.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("both rows go or neither does", async () => {
    asOwner();
    seed(
      [photoEvidence()],
      [{ id: "ph_1", inspectionId: "insp_1", url: URL_A }],
    );
    state.failPhotoDelete = true;

    const response = await remove();

    expect(response.status).toBeGreaterThanOrEqual(500);
    // The evidence record is still there: a photograph must not be left
    // counted with no evidence behind it.
    expect(state.evidence).toHaveLength(1);
    expect(state.photos).toHaveLength(1);
  });

  it("keeps the photograph row while another evidence record still cites the same file", async () => {
    // Two evidence records for one upload share one photograph row (the
    // backfill writes one row per URL). Deleting one of them must not make
    // the other an uncounted photograph.
    asOwner();
    seed(
      [photoEvidence(), photoEvidence({ id: "ev_photo_twin" })],
      [{ id: "ph_1", inspectionId: "insp_1", url: URL_A }],
    );

    const response = await remove();

    expect(response.status).toBe(200);
    expect(state.evidence.map((row) => row.id)).toEqual(["ev_photo_twin"]);
    expect(state.photos).toHaveLength(1);
  });

  it("a document that happens to share a URL with a photograph row removes nothing but itself", async () => {
    // Only photograph classes ever write a photograph row, so only they may
    // remove one.
    asOwner();
    seed(
      [photoEvidence({ evidenceClass: "AUTHORITY_FORM" })],
      [{ id: "ph_1", inspectionId: "insp_1", url: URL_A }],
    );

    const response = await remove();

    expect(response.status).toBe(200);
    expect(state.evidence).toHaveLength(0);
    expect(state.photos).toHaveLength(1);
  });

  it("gives the two-row delete explicit wait and run limits", async () => {
    asOwner();
    seed(
      [photoEvidence()],
      [{ id: "ph_1", inspectionId: "insp_1", url: URL_A }],
    );

    await remove();

    expect(state.transactionOptions).toEqual([
      { maxWait: expect.any(Number), timeout: expect.any(Number) },
    ]);
  });

  // RA-8388 review round 2. The handler read `evidenceId` straight from the
  // body. With none supplied, the assigned technician's `deleteMany` matched
  // every record they had captured on the draft job, and because more than
  // one went, no photograph row was removed: every photograph stayed counted
  // with no evidence behind it.
  describe("a delete that does not name one record removes nothing", () => {
    const twoPhotographs = () =>
      seed(
        [
          photoEvidence({ id: "ev_1", fileUrl: URL_A }),
          photoEvidence({ id: "ev_2", fileUrl: `${URL_A}?2` }),
        ],
        [
          { id: "ph_1", inspectionId: "insp_1", url: URL_A },
          { id: "ph_2", inspectionId: "insp_1", url: `${URL_A}?2` },
        ],
      );

    const send = (body: string) =>
      DELETE(
        new NextRequest("http://localhost/api/inspections/insp_1/evidence", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body,
        }),
        { params: Promise.resolve({ id: "insp_1" }) },
      );

    const BODIES: Array<[string, string]> = [
      ["an empty object", "{}"],
      ["a null identifier", '{"evidenceId":null}'],
      ["an empty identifier", '{"evidenceId":""}'],
      ["an identifier that is not text", '{"evidenceId":{"not":"x"}}'],
      ["a list of identifiers", '{"evidenceId":["ev_1","ev_2"]}'],
      ["a body that is not an object", "null"],
      ["a body that is not JSON", "{"],
    ];

    for (const [name, body] of BODIES) {
      it(`the assigned technician sending ${name} is refused with 400`, async () => {
        asAssignedTechnician();
        twoPhotographs();

        const response = await send(body);

        expect(response.status).toBe(400);
        expect(JSON.stringify(await response.json())).toMatch(
          /evidenceId is required/,
        );
        expect(state.evidence).toHaveLength(2);
        expect(state.photos).toHaveLength(2);
        expect(state.auditCreate).not.toHaveBeenCalled();
      });

      it(`the owner sending ${name} is refused with 400`, async () => {
        asOwner();
        twoPhotographs();

        const response = await send(body);

        expect(response.status).toBe(400);
        expect(state.evidence).toHaveLength(2);
        expect(state.photos).toHaveLength(2);
      });
    }
  });
});
