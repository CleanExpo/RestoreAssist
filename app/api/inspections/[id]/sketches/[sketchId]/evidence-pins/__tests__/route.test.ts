import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signStoredMediaUrl = vi.hoisted(() => vi.fn());
const inspectionStorageRef = vi.hoisted(() => vi.fn());
const toStorageLocator = vi.hoisted(() => vi.fn());

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
): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
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
