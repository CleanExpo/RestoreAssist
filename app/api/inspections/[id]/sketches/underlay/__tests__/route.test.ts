import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prepareUnderlayBytes = vi.hoisted(() => vi.fn());
const storeUnderlay = vi.hoisted(() => vi.fn());
const removeStoredUnderlay = vi.hoisted(() => vi.fn());
const fetchRemoteUnderlay = vi.hoisted(() => vi.fn());
const isUnderlayUrlImportEnabled = vi.hoisted(() => vi.fn());
const requireAddon = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
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
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { DELETE, POST } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const tenancy = assertInspectionTenancy as unknown as ReturnType<typeof vi.fn>;
const transaction = (
  prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
).$transaction;
const context = { params: Promise.resolve({ id: "inspection-1" }) };

function uploadRequest(overrides: Record<string, string> = {}): NextRequest {
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
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "plan.png", {
      type: "image/png",
    }),
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
  tenancy.mockResolvedValue({ ok: true });
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
