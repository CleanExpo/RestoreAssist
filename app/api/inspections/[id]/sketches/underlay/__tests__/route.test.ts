import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const prepareUnderlayBytes = vi.hoisted(() => vi.fn());
const storeUnderlay = vi.hoisted(() => vi.fn());
const removeStoredUnderlay = vi.hoisted(() => vi.fn());
const fetchRemoteUnderlay = vi.hoisted(() => vi.fn());
const isUnderlayUrlImportEnabled = vi.hoisted(() => vi.fn());
const requireAddon = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// D-028: create/update handlers gate on assertInspectionAssignedWrite.
vi.mock("@/lib/auth/assert-tenancy", () => ({
  // D-028: scoped writes run their work against the mocked client here;
  // the claim itself is proven against Postgres in the integration table.
  writeWithinInspectionScope: async (
    _scope: unknown,
    _data: unknown,
    work: (tx: unknown) => unknown,
  ) =>
    // Run through the mocked $transaction so the test's tx object is used.
    (
      scopePrisma as unknown as {
        $transaction: (fn: (tx: unknown) => unknown) => unknown;
      }
    ).$transaction(work),
  // DELETE keeps the owner's reach (D-028: create and update only).
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: {
      inspectionWhere: { id: "insp-1" },
      inspectionManyWhere: { id: "insp-1" },
      childInspectionFilter: undefined,
      viaAssignment: false,
    },
  })),
}));
vi.mock("@/lib/sketch/server-underlay-import", () => ({
  prepareUnderlayBytes,
  storeUnderlay,
  removeStoredUnderlay,
  fetchRemoteUnderlay,
}));
vi.mock("@/lib/sketch/underlay-import-flag", () => ({
  isUnderlayUrlImportEnabled,
}));
vi.mock("@/lib/entitlements", () => ({ requireAddon }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    claimSketch: { updateMany: vi.fn() },
    sketchUnderlayReference: { updateMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { assertInspectionAssignedWrite } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { DELETE, POST } from "../route";
import {
  genuineImage,
  makeJpeg,
  makeJpegWithoutScan,
  makeOrientedJpeg,
  makeTruncatedScanJpeg,
  makePng,
  makePngWithGarbageIdat,
  makePngWithoutIdat,
  makeWebp,
  makeWebpCanvasOnly,
} from "@/lib/media/__tests__/image-fixtures";

const truncatedScanJpeg = new Uint8Array(await makeTruncatedScanJpeg());

const genuine = {
  png: new Uint8Array(await genuineImage("png", 40, 30)),
  jpeg: new Uint8Array(await genuineImage("jpeg", 40, 30)),
  webp: new Uint8Array(await genuineImage("webp", 40, 30)),
};

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const tenancy = assertInspectionAssignedWrite as unknown as ReturnType<
  typeof vi.fn
>;
const transaction = (
  prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
).$transaction;
const context = { params: Promise.resolve({ id: "inspection-1" }) };

function uploadRequest(
  overrides: Record<string, string> = {},
  file: { bytes: Uint8Array; type: string; name?: string } = {
    bytes: genuine.png,
    type: "image/png",
  },
): NextRequest {
  const form = new FormData();
  form.set("source", overrides.source ?? "upload");
  form.set("floorNumber", overrides.floorNumber ?? "0");
  form.set("holdsRights", overrides.holdsRights ?? "true");
  form.set(
    "compliesWithSourceTerms",
    overrides.compliesWithSourceTerms ?? "true",
  );
  form.set(
    "file",
    new File([file.bytes], file.name ?? "plan.png", { type: file.type }),
  );
  return new NextRequest(
    "http://localhost/api/inspections/inspection-1/sketches/underlay",
    { method: "POST", body: form },
  );
}

function urlRequest(): NextRequest {
  const form = new FormData();
  form.set("source", "url");
  form.set("floorNumber", "1");
  form.set("holdsRights", "true");
  form.set("compliesWithSourceTerms", "true");
  form.set("sourcePageUrl", "https://www.onthehouse.com.au/property/example");
  form.set("remoteImageUrl", "https://images.example.test/plan.png");
  return new NextRequest(
    "http://localhost/api/inspections/inspection-1/sketches/underlay",
    { method: "POST", body: form },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "user-1" } });
  tenancy.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: { id: "inspection-1" },
      inspectionManyWhere: { id: "inspection-1" },
      childInspectionFilter: undefined,
      viaAssignment: false,
    },
  });
  isUnderlayUrlImportEnabled.mockReturnValue(false);
  requireAddon.mockResolvedValue({ allowed: true });
  prepareUnderlayBytes.mockResolvedValue({
    bytes: Buffer.from("normalised-watermarked-png"),
    mimeType: "image/png",
    contentSha256: "a".repeat(64),
    sourceSizeBytes: 4,
  });
  storeUnderlay.mockResolvedValue({
    storagePath: `inspections/inspection-1/underlays/floor-0-${"a".repeat(64)}.png`,
    signedUrl: "https://storage.test/signed-preview",
    created: true,
  });
});

describe("POST floor-plan reference underlay", () => {
  it("rejects a foreign inspection before reading or storing bytes", async () => {
    tenancy.mockResolvedValue({ ok: false, status: 404, reason: "Not found" });

    const response = await POST(uploadRequest(), context);

    expect(response.status).toBe(404);
    expect(prepareUnderlayBytes).not.toHaveBeenCalled();
    expect(storeUnderlay).not.toHaveBeenCalled();
  });

  it("requires both rights attestations before storage", async () => {
    const response = await POST(
      uploadRequest({ holdsRights: "false" }),
      context,
    );

    expect(response.status).toBe(400);
    expect(prepareUnderlayBytes).not.toHaveBeenCalled();
    expect(storeUnderlay).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("binds the exact stored hash, path and actor in one database transaction", async () => {
    const tx = {
      claimSketch: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "sketch-1" })),
        update: vi.fn(),
      },
      sketchUnderlayReference: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async () => ({ id: "reference-1" })),
      },
      auditLog: { create: vi.fn(async () => ({ id: "audit-1" })) },
    };
    transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    const response = await POST(uploadRequest(), context);

    expect(response.status).toBe(201);
    expect(tx.claimSketch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionId: "inspection-1",
          backgroundImageUrl: expect.stringMatching(
            /^storage:\/\/sketch-media\/inspections\/inspection-1\/underlays\//,
          ),
        }),
      }),
    );
    expect(tx.sketchUnderlayReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionId: "inspection-1",
          sketchId: "sketch-1",
          contentSha256: "a".repeat(64),
          attestedByUserId: "user-1",
          holdsRights: true,
          compliesWithSourceTerms: true,
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      recorded: true,
      sketchId: "sketch-1",
      referenceId: "reference-1",
      contentSha256: "a".repeat(64),
    });
  });

  it("removes stored bytes when the custody transaction fails", async () => {
    transaction.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(uploadRequest(), context);

    expect(response.status).toBe(500);
    expect(removeStoredUnderlay).toHaveBeenCalledWith(
      expect.stringContaining("inspections/inspection-1/underlays/"),
    );
  });

  it("keeps remote listing import behind its kill switch", async () => {
    const response = await POST(urlRequest(), context);

    expect(response.status).toBe(409);
    expect(requireAddon).not.toHaveBeenCalled();
    expect(fetchRemoteUnderlay).not.toHaveBeenCalled();
    expect(storeUnderlay).not.toHaveBeenCalled();
  });

  it("records a new attestation when identical stored bytes are re-imported", async () => {
    storeUnderlay.mockResolvedValueOnce({
      storagePath: `inspections/inspection-1/underlays/floor-0-${"a".repeat(64)}.png`,
      signedUrl: "https://storage.test/existing-preview",
      created: false,
    });
    const tx = {
      claimSketch: {
        findFirst: vi.fn(async () => ({ id: "sketch-1" })),
        create: vi.fn(),
        update: vi.fn(async () => ({ id: "sketch-1" })),
      },
      sketchUnderlayReference: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => ({ id: "reference-2" })),
      },
      auditLog: { create: vi.fn(async () => ({ id: "audit-2" })) },
    };
    transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    const response = await POST(uploadRequest(), context);

    expect(response.status).toBe(201);
    expect(tx.sketchUnderlayReference.create).toHaveBeenCalled();
    expect(removeStoredUnderlay).not.toHaveBeenCalled();
  });
});

describe("RA-8234 strict upload policy (underlay)", () => {
  const rejected: [string, () => Uint8Array, string][] = [
    [
      "HTML renamed .png",
      () => new TextEncoder().encode("<html><script>1</script></html>"),
      "image/png",
    ],
    [
      "bare PNG magic spoof",
      () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "image/png",
    ],
    [
      "truncated PNG",
      () => new Uint8Array(makePng(10, 10).subarray(0, 40)),
      "image/png",
    ],
    [
      "pixel bomb",
      () => new Uint8Array(makePng(100_000, 100_000)),
      "image/png",
    ],
    [
      "PNG with no IDAT (terminated, undecodable)",
      () => new Uint8Array(makePngWithoutIdat()),
      "image/png",
    ],
    [
      "PNG with garbage IDAT",
      () => new Uint8Array(makePngWithGarbageIdat()),
      "image/png",
    ],
    [
      "JPEG with one-byte truncated scan",
      () => truncatedScanJpeg,
      "image/jpeg",
    ],
    [
      "JPEG with no scan",
      () => new Uint8Array(makeJpegWithoutScan()),
      "image/jpeg",
    ],
    [
      "WebP canvas only (no image chunk)",
      () => new Uint8Array(makeWebpCanvasOnly()),
      "image/webp",
    ],
    [
      "PNG bytes declared as JPEG",
      () => new Uint8Array(makePng()),
      "image/jpeg",
    ],
    [
      "GIF",
      () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      "image/gif",
    ],
  ];
  it.each(rejected)(
    "rejects %s before the prepare step, storage or the database",
    async (_n, bytes, type) => {
      const res = await POST(
        uploadRequest({}, { bytes: bytes(), type }),
        context,
      );
      expect(res.status).toBe(400);
      expect(prepareUnderlayBytes).not.toHaveBeenCalled();
      expect(storeUnderlay).not.toHaveBeenCalled();
      expect(removeStoredUnderlay).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects more than 10 MB of actual bytes with 413", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(makePng());
    const res = await POST(
      uploadRequest({}, { bytes: big, type: "image/png" }),
      context,
    );
    expect(res.status).toBe(413);
    expect(prepareUnderlayBytes).not.toHaveBeenCalled();
    expect(storeUnderlay).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", () => genuine.png],
    ["image/jpeg", () => genuine.jpeg],
    ["image/webp", () => genuine.webp],
  ])(
    "passes a genuine %s to prepare with its canonical type",
    async (type, make) => {
      const tx = {
        claimSketch: {
          findFirst: vi.fn(async () => null),
          create: vi.fn(async () => ({ id: "s" })),
          update: vi.fn(),
        },
        sketchUnderlayReference: {
          updateMany: vi.fn(async () => ({ count: 0 })),
          create: vi.fn(async () => ({ id: "r" })),
        },
        auditLog: { create: vi.fn(async () => ({ id: "a" })) },
      };
      transaction.mockImplementation(async (cb: (c: typeof tx) => unknown) =>
        cb(tx),
      );
      const bytes = make();
      const res = await POST(uploadRequest({}, { bytes, type }), context);
      expect(res.status).toBe(201);
      expect(prepareUnderlayBytes).toHaveBeenCalledTimes(1);
      const [sent, mime] = prepareUnderlayBytes.mock.calls[0];
      expect(Buffer.from(sent).equals(Buffer.from(bytes))).toBe(true);
      expect(mime).toBe(type);
    },
  );

  it("tenant B: an invalid file from a foreign inspection is 404, not a validation answer", async () => {
    tenancy.mockResolvedValue({ ok: false, status: 404, reason: "Not found" });
    const res = await POST(
      uploadRequest(
        {},
        { bytes: new TextEncoder().encode("<html>"), type: "image/png" },
      ),
      context,
    );
    expect(res.status).toBe(404);
    expect(prepareUnderlayBytes).not.toHaveBeenCalled();
    expect(storeUnderlay).not.toHaveBeenCalled();
  });

  it("source=url stays refused even with a valid file attached", async () => {
    const res = await POST(uploadRequest({ source: "url" }), context);
    expect(res.status).toBe(409);
    expect(fetchRemoteUnderlay).not.toHaveBeenCalled();
    expect(prepareUnderlayBytes).not.toHaveBeenCalled();
    expect(storeUnderlay).not.toHaveBeenCalled();
  });
});

describe("RA-8234 EXIF-oriented phone photos (real prepare step)", () => {
  it.each([3, 6, 8])(
    "orientation %i reaches storage as a decoded, watermarked PNG (201)",
    async (orientation) => {
      const actual = await vi.importActual<
        typeof import("@/lib/sketch/server-underlay-import")
      >("@/lib/sketch/server-underlay-import");
      prepareUnderlayBytes.mockImplementation(actual.prepareUnderlayBytes);
      const tx = {
        claimSketch: {
          findFirst: vi.fn(async () => null),
          create: vi.fn(async () => ({ id: "s" })),
          update: vi.fn(),
        },
        sketchUnderlayReference: {
          updateMany: vi.fn(async () => ({ count: 0 })),
          create: vi.fn(async () => ({ id: "r" })),
        },
        auditLog: { create: vi.fn(async () => ({ id: "a" })) },
      };
      transaction.mockImplementation(async (cb: (c: typeof tx) => unknown) =>
        cb(tx),
      );
      const jpeg = new Uint8Array(await makeOrientedJpeg(orientation));
      const res = await POST(
        uploadRequest({}, { bytes: jpeg, type: "image/jpeg" }),
        context,
      );
      expect(res.status).toBe(201);
      expect(storeUnderlay).toHaveBeenCalledTimes(1);
      const stored = storeUnderlay.mock.calls[0][2];
      const sharp = (await import("sharp")).default;
      const meta = await sharp(stored.bytes).metadata();
      expect([meta.width, meta.height]).toEqual(
        orientation === 3 ? [64, 48] : [48, 64],
      );
      expect(stored.contentSha256).toBe(
        (await import("node:crypto"))
          .createHash("sha256")
          .update(stored.bytes)
          .digest("hex"),
      );
    },
  );
});

describe("DELETE floor-plan reference underlay", () => {
  it("clears both source pixels and any prior rendered claim image", async () => {
    transaction.mockResolvedValue([]);
    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/inspections/inspection-1/sketches/underlay?floorNumber=0",
        { method: "DELETE" },
      ),
      context,
    );

    expect(response.status).toBe(200);
    const claimSketch = (
      prisma as unknown as {
        claimSketch: { updateMany: ReturnType<typeof vi.fn> };
      }
    ).claimSketch;
    expect(claimSketch.updateMany).toHaveBeenCalledWith({
      where: { inspectionId: "inspection-1", floorNumber: 0 },
      data: { backgroundImageUrl: null, renderedPngUrl: null },
    });
  });
});
