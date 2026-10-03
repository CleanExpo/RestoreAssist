import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signStoredMediaUrl = vi.hoisted(() => vi.fn());
const inspectionStorageRef = vi.hoisted(() => vi.fn());
const toStorageLocator = vi.hoisted(() => vi.fn());
const idempotency = vi.hoisted(() => ({ records: new Map<string, Record<string, any>>(), nextId: 0 }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/storage/sign-stored-url", () => ({
  signStoredMediaUrl,
  inspectionStorageRef,
  toStorageLocator,
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: { findFirst: vi.fn() },
    inspectionPhoto: { findFirst: vi.fn() },
    evidencePin: { create: vi.fn(), findMany: vi.fn() },
    idempotencyRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
        if (idempotency.records.has(data.cacheKey)) throw { code: "P2002" };
        const id = `reservation-${++idempotency.nextId}`;
        idempotency.records.set(data.cacheKey, { ...data, id, responseStatus: null, responseBody: null, responseContentType: null });
        return { id };
      }),
      findUnique: vi.fn(async ({ where }: { where: { cacheKey: string } }) => idempotency.records.get(where.cacheKey) ?? null),
      update: vi.fn(async ({ where, data }: { where: { cacheKey: string }; data: Record<string, any> }) => {
        const record = idempotency.records.get(where.cacheKey);
        if (!record) throw new Error("missing idempotency reservation");
        idempotency.records.set(where.cacheKey, { ...record, ...data });
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { cacheKey: string; id?: string; status?: string; fingerprint?: string }; data: Record<string, any> }) => {
        const record = idempotency.records.get(where.cacheKey);
        if (!record || (where.id && record.id !== where.id) ||
            (where.status && record.status !== where.status) ||
            (where.fingerprint && record.fingerprint !== where.fingerprint)) return { count: 0 };
        idempotency.records.set(where.cacheKey, { ...record, ...data });
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { cacheKey?: string; id?: string; status?: string; expiresAt?: { lt: Date } } }) => {
        let count = 0;
        for (const [key, record] of idempotency.records) {
          if (where.cacheKey && key !== where.cacheKey) continue;
          if (where.id && record.id !== where.id) continue;
          if (where.status && record.status !== where.status) continue;
          if (where.expiresAt && record.expiresAt >= where.expiresAt.lt) continue;
          idempotency.records.delete(key);
          count++;
        }
        return { count };
      }),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  claimSketch: { findFirst: ReturnType<typeof vi.fn> };
  inspectionPhoto: { findFirst: ReturnType<typeof vi.fn> };
  evidencePin: { create: ReturnType<typeof vi.fn> };
};

const context = {
  params: Promise.resolve({ id: "inspection-1", sketchId: "sketch-1" }),
};

function request(
  photoId: string,
  overrides: Record<string, unknown> = {},
  pinKey?: string,
): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(pinKey ? { "Idempotency-Key": pinKey } : {}),
      },
      body: JSON.stringify({
        kind: "photo",
        x: 400,
        y: 300,
        nx: 0.5,
        ny: 0.5,
        inspectionPhotoId: photoId,
        fileUrl: "https://attacker.test/substitution.jpg",
        ...overrides,
      }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  idempotency.records.clear();
  idempotency.nextId = 0;
  session.mockResolvedValue({ user: { id: "user-1" } });
  db.claimSketch.findFirst.mockResolvedValue({ id: "sketch-1", rooms: [] });
  signStoredMediaUrl.mockImplementation(async (url: string | null) =>
    url ? `fresh:${url}` : url,
  );
  inspectionStorageRef.mockReturnValue(null);
  toStorageLocator.mockImplementation(
    (ref: { bucket: string; path: string }) =>
      `storage://${ref.bucket}/${ref.path}`,
  );
  db.evidencePin.create.mockImplementation(async ({ data }: any) => ({
    id: "pin-1",
    ...data,
  }));
});

describe("POST evidence pin with an existing inspection photo", () => {
  it("reserves one pin for concurrent same-key requests and replays its committed response", async () => {
    db.inspectionPhoto.findFirst.mockResolvedValue({
      id: "photo-1", url: "storage://inspection-photos/inspections/inspection-1/photo.jpg",
      thumbnailUrl: null, description: null, location: null, mimeType: "image/jpeg", fileSize: 3,
    });
    let finishCreate!: (pin: Record<string, unknown>) => void;
    db.evidencePin.create.mockImplementationOnce(() => new Promise((resolve) => { finishCreate = resolve; }));

    const first = POST(request("photo-1", {}, "pin-operation-1"), context);
    await vi.waitFor(() => expect(db.evidencePin.create).toHaveBeenCalledTimes(1));
    const concurrent = await POST(request("photo-1", {}, "pin-operation-1"), context);
    expect(concurrent.status).toBe(409);
    finishCreate({ id: "pin-1", sketchId: "sketch-1", inspectionPhotoId: "photo-1", kind: "photo", x: 400, y: 300, fileUrl: null, thumbnailUrl: null });
    expect((await first).status).toBe(201);
    const replay = await POST(request("photo-1", {}, "pin-operation-1"), context);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(db.evidencePin.create).toHaveBeenCalledTimes(1);
  });

  it("rejects the same key with changed coordinates without creating another pin", async () => {
    db.inspectionPhoto.findFirst.mockResolvedValue({
      id: "photo-1", url: "storage://inspection-photos/inspections/inspection-1/photo.jpg",
      thumbnailUrl: null, description: null, location: null, mimeType: "image/jpeg", fileSize: 3,
    });
    expect((await POST(request("photo-1", {}, "pin-operation-1"), context)).status).toBe(201);
    const changed = await POST(request("photo-1", { x: 401 }, "pin-operation-1"), context);
    expect(changed.status).toBe(409);
    expect(db.evidencePin.create).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a completed key on another authorized floor", async () => {
    db.inspectionPhoto.findFirst.mockResolvedValue({
      id: "photo-1", url: "storage://inspection-photos/inspections/inspection-1/photo.jpg",
      thumbnailUrl: null, description: null, location: null, mimeType: "image/jpeg", fileSize: 3,
    });
    expect((await POST(request("photo-1", {}, "pin-operation-1"), context)).status).toBe(201);
    const otherFloor = new NextRequest(
      "http://localhost/api/inspections/inspection-1/sketches/sketch-2/evidence-pins",
      {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "pin-operation-1" },
        body: JSON.stringify({ kind: "photo", x: 400, y: 300, nx: 0.5, ny: 0.5,
          inspectionPhotoId: "photo-1", fileUrl: "https://attacker.test/substitution.jpg" }),
      },
    );
    expect((await POST(otherFloor, { params: Promise.resolve({ id: "inspection-1", sketchId: "sketch-2" }) })).status).toBe(409);
    expect(db.claimSketch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sketch-2", inspectionId: "inspection-1" },
    }));
    expect(db.evidencePin.create).toHaveBeenCalledTimes(1);
  });

  it("uses server-authoritative metadata from the same inspection", async () => {
    db.inspectionPhoto.findFirst.mockResolvedValue({
      id: "photo-1",
      url: "https://cdn.test/photo-1.jpg",
      thumbnailUrl: "https://cdn.test/photo-1-thumb.jpg",
      description: "Kitchen leak",
      location: "Kitchen",
      mimeType: "image/jpeg",
      fileSize: 1234,
    });

    const response = await POST(request("photo-1"), context);

    expect(response.status).toBe(201);
    expect(db.inspectionPhoto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "photo-1", inspectionId: "inspection-1" },
      }),
    );
    expect(db.evidencePin.create.mock.calls[0][0].data).toMatchObject({
      inspectionPhotoId: "photo-1",
      fileUrl: "https://cdn.test/photo-1.jpg",
      thumbnailUrl: "https://cdn.test/photo-1-thumb.jpg",
      caption: "Kitchen leak",
      fileMimeType: "image/jpeg",
      fileSizeBytes: 1234,
    });
    await expect(response.json()).resolves.toMatchObject({
      pin: {
        fileUrl: "fresh:https://cdn.test/photo-1.jpg",
        thumbnailUrl: "fresh:https://cdn.test/photo-1-thumb.jpg",
      },
    });
  });

  it("answers a database failure inside the idempotent handler with the route's error response", async () => {
    db.inspectionPhoto.findFirst.mockRejectedValue(new Error("db down"));

    const response = await POST(request("photo-1"), context);

    expect(response.status).toBe(500);
    expect(db.evidencePin.create).not.toHaveBeenCalled();
  });

  it("rejects a photo that is not part of the inspection", async () => {
    db.inspectionPhoto.findFirst.mockResolvedValue(null);

    const response = await POST(request("other-inspection-photo"), context);

    expect(response.status).toBe(400);
    expect(db.evidencePin.create).not.toHaveBeenCalled();
  });

  it("rejects an explicit room from another sketch", async () => {
    db.claimSketch.findFirst.mockResolvedValue({
      id: "sketch-1",
      rooms: [{ id: "room-local", name: "Kitchen", geometryJson: null }],
    });
    db.inspectionPhoto.findFirst.mockResolvedValue({
      id: "photo-1",
      url: "storage://inspection-photos/inspections/inspection-1/photo.jpg",
      thumbnailUrl: null,
      description: null,
      location: null,
      mimeType: "image/jpeg",
      fileSize: 1234,
    });

    const response = await POST(
      request("photo-1", { sketchRoomId: "room-from-another-sketch" }),
      context,
    );

    expect(response.status).toBe(400);
    expect(db.evidencePin.create).not.toHaveBeenCalled();
  });
});

describe("GET evidence pins", () => {
  it("rejects incomplete or invalid exact pin lookups before database access", async () => {
    const base = "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins";
    for (const query of ["?inspectionPhotoId=photo-1&x=400", "?inspectionPhotoId=photo-1&x=NaN&y=300", "?inspectionPhotoId=&x=400&y=300"]) {
      expect((await GET(new NextRequest(base + query), context)).status).toBe(400);
    }
    expect(prisma.evidencePin.findMany).not.toHaveBeenCalled();
  });

  it("reads one photo and placement within its authorized floor beyond the ordinary list cap", async () => {
    (prisma.evidencePin.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const response = await GET(new NextRequest(
      "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins?inspectionPhotoId=photo-1&x=400&y=300",
    ), context);
    expect(response.status).toBe(200);
    expect(prisma.evidencePin.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sketchId: "sketch-1",
        inspectionPhotoId: "photo-1",
        x: expect.objectContaining({ gt: 399.999, lt: 400.001 }),
        y: expect.objectContaining({ gt: 299.999, lt: 300.001 }),
      }),
      take: 10,
    }));
  });

  it("does not read another tenant or another inspection's sketch", async () => {
    const { assertInspectionTenancy } = await import("@/lib/auth/assert-tenancy");
    vi.mocked(assertInspectionTenancy).mockResolvedValueOnce({ ok: false, status: 403, reason: "Forbidden" } as never);
    const lookup = new NextRequest(
      "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins?inspectionPhotoId=photo-1&x=400&y=300",
    );
    expect((await GET(lookup, context)).status).toBe(403);
    expect(prisma.evidencePin.findMany).not.toHaveBeenCalled();

    db.claimSketch.findFirst.mockResolvedValueOnce(null);
    expect((await GET(new NextRequest(lookup.url), context)).status).toBe(404);
    expect(db.claimSketch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sketch-1", inspectionId: "inspection-1" },
    }));
    expect(prisma.evidencePin.findMany).not.toHaveBeenCalled();
  });

  it("re-signs stored private-media URLs before returning them", async () => {
    (
      prisma.evidencePin.findMany as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        id: "pin-1",
        sketchId: "sketch-1",
        sketchRoomId: null,
        inspectionPhotoId: "photo-1",
        kind: "photo",
        x: 10,
        y: 20,
        nx: 0.1,
        ny: 0.2,
        rotationDeg: 0,
        scale: 1,
        fileUrl: "https://storage.test/stale-full.jpg",
        thumbnailUrl: "https://storage.test/stale-thumb.jpg",
        fileName: null,
        fileMimeType: "image/jpeg",
        caption: "Kitchen leak",
        captureSource: "web",
        syncState: "synced",
        createdAt: new Date("2026-08-09T00:00:00Z"),
        updatedAt: new Date("2026-08-09T00:00:00Z"),
      },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins",
      ),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pins: [
        {
          fileUrl: "fresh:https://storage.test/stale-full.jpg",
          thumbnailUrl: "fresh:https://storage.test/stale-thumb.jpg",
        },
      ],
    });
  });
});
