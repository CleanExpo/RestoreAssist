/**
 * RA-8388 bench round 1: a photograph that is saved but not counted must say so.
 *
 * The fault this change exists to fix was an INVISIBLE non-count: the upload
 * returned 201, the photograph appeared in the evidence list, and the submit
 * gate still reported missing photographs with nothing to trace it to.
 *
 * After the one-photograph-rule fix the route cannot reach this state by
 * itself: a verified image under a photograph class always counts. So this
 * suite forces the shared predicate to answer "not counted" and proves the
 * route then tells BOTH readers: the capture page (a boolean in the 201) and
 * the log (one warn line carrying the ids needed to find the upload). It is
 * a guard against a regression in the predicate, not a description of a
 * state a technician can produce today.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: async () => null,
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionCapturable: vi.fn(async () => ({
    ok: true,
    data: { workspaceId: null },
  })),
  assertInspectionTenancy: vi.fn(),
  assertInspectionAssignedWrite: vi.fn(),
}));

const db = vi.hoisted(() => ({
  evidenceCreate: vi.fn(),
  photoCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    evidenceItem: { create: db.evidenceCreate },
    inspectionPhoto: { create: db.photoCreate },
    deviceSigningKey: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) =>
      fn({
        evidenceItem: { create: db.evidenceCreate },
        inspectionPhoto: { create: db.photoCreate },
      }),
    ),
  },
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(async () => ({
    upload: vi.fn(async () => ({
      compressedUrl: "https://storage/evidence/x-compressed.jpg",
      thumbnailUrl: "https://storage/evidence/x-thumb.jpg",
      storagePath: "evidence/x-original.jpg",
      compressedPath: "evidence/x-compressed.jpg",
      thumbnailPath: "evidence/x-thumb.jpg",
    })),
    delete: vi.fn(),
  })),
}));

// The ONE owner of "does this photograph count" is forced to say no. Both
// names are overridden so the test holds whichever one the route calls.
vi.mock("@/lib/evidence/authoritative-rows", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/evidence/authoritative-rows")>();
  return {
    ...real,
    shouldWritePhotoRow: () => false,
    photoCountDecision: () => ({ counts: false, reason: "not-an-image-type" }),
  };
});

import { getServerSession } from "next-auth";
import { POST } from "../route";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function upload(evidenceClass: string) {
  const form = new FormData();
  form.append("file", new File([JPEG], "damage.jpg", { type: "image/jpeg" }));
  form.append("evidenceClass", evidenceClass);
  return POST(
    new NextRequest("http://localhost/api/inspections/insp_1/evidence", {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "u1", name: "Tech One" },
  });
  db.evidenceCreate.mockImplementation(async ({ data }: any) => ({
    id: "ev_77",
    ...data,
  }));
  db.photoCreate.mockImplementation(async ({ data }: any) => data);
  process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
  warnSpy.mockRestore();
});

describe("a photograph saved without a counted row says so", () => {
  it("the 201 body carries countsTowardSubmission: false", async () => {
    const res = await upload("PHOTO_DAMAGE");

    expect(res.status).toBe(201);
    expect(db.evidenceCreate).toHaveBeenCalledTimes(1);
    expect(db.photoCreate).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.countsTowardSubmission).toBe(false);
  });

  it("warns once with a fixed tag and the ids needed to find the upload", async () => {
    await upload("PHOTO_DAMAGE");

    const calls = warnSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "[evidence] photograph-not-counted",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      inspectionId: "insp_1",
      evidenceId: "ev_77",
      evidenceClass: "PHOTO_DAMAGE",
      declaredType: "image/jpeg",
    });
  });
});
