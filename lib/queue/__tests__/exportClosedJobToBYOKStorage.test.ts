/**
 * SP-E Block 5 — exportClosedJobToBYOKStorage contract.
 *
 * The hook is fire-and-forget at the call site, but the contract IS:
 *   - builds a ZIP via lib/exports/job-package-zip
 *   - writes it to Supabase at `closures/<orgId>/<inspectionId>/job-package.zip`
 *   - enqueues a StorageMirrorJob of kind JOB_PACKAGE
 *   - returns `{ storageKey, byteSize, mirrorJobId }`
 *
 * On internal failure it returns empty-string placeholders (caller treats
 * empty storageKey as "retry from settings page").
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  inspectionMock,
  buildJobPackageStreamMock,
  queueMirrorJobMock,
  supabaseUploadMock,
} = vi.hoisted(() => ({
  inspectionMock: { findUnique: vi.fn() },
  buildJobPackageStreamMock: vi.fn(),
  queueMirrorJobMock: vi.fn(),
  supabaseUploadMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: inspectionMock },
}));

vi.mock("@/lib/exports/job-package-zip", () => ({
  buildJobPackageStream: buildJobPackageStreamMock,
}));

vi.mock("@/lib/queue/storage-mirror", () => ({
  queueMirrorJob: queueMirrorJobMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: {
      from: () => ({
        upload: supabaseUploadMock,
      }),
    },
  }),
}));

import { exportClosedJobToBYOKStorage } from "@/lib/queue/exportClosedJobToBYOKStorage";
import { MirrorJobKind } from "@prisma/client";

beforeEach(() => {
  vi.clearAllMocks();
  buildJobPackageStreamMock.mockResolvedValue({
    buffer: Buffer.from("zip-bytes"),
    byteSize: 9,
  });
  queueMirrorJobMock.mockResolvedValue("mirror_job_1");
  supabaseUploadMock.mockResolvedValue({ error: null });
  inspectionMock.findUnique.mockResolvedValue({
    id: "insp_1",
    user: { organizationId: "org_1" },
  });
});

describe("exportClosedJobToBYOKStorage — happy path", () => {
  it("writes the ZIP to Supabase and enqueues a JOB_PACKAGE mirror job", async () => {
    const result = await exportClosedJobToBYOKStorage("insp_1");

    expect(buildJobPackageStreamMock).toHaveBeenCalledWith("insp_1");
    expect(supabaseUploadMock).toHaveBeenCalledTimes(1);
    expect(supabaseUploadMock.mock.calls[0][0]).toBe(
      "closures/org_1/insp_1/job-package.zip",
    );
    expect(queueMirrorJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        kind: MirrorJobKind.JOB_PACKAGE,
        sourceStoragePath: "closures/org_1/insp_1/job-package.zip",
        filename: "job-package.zip",
        mimeType: "application/zip",
        inspectionId: "insp_1",
      }),
    );

    expect(result.storageKey).toBe("closures/org_1/insp_1/job-package.zip");
    expect(result.byteSize).toBe(9);
    expect(result.mirrorJobId).toBe("mirror_job_1");
  });
});

describe("exportClosedJobToBYOKStorage — graceful failure", () => {
  it("returns empty placeholders when the inspection has no org context", async () => {
    inspectionMock.findUnique.mockResolvedValueOnce({
      id: "insp_1",
      user: { organizationId: null },
    });

    const result = await exportClosedJobToBYOKStorage("insp_1");

    expect(result).toEqual({ storageKey: "", byteSize: 0, mirrorJobId: "" });
    expect(buildJobPackageStreamMock).not.toHaveBeenCalled();
    expect(queueMirrorJobMock).not.toHaveBeenCalled();
  });

  it("returns empty placeholders when Supabase upload fails", async () => {
    supabaseUploadMock.mockResolvedValueOnce({
      error: { message: "supabase outage" },
    });

    const result = await exportClosedJobToBYOKStorage("insp_1");

    expect(result.storageKey).toBe("");
    expect(queueMirrorJobMock).not.toHaveBeenCalled();
  });

  it("returns empty placeholders when ZIP assembly throws", async () => {
    buildJobPackageStreamMock.mockRejectedValueOnce(new Error("zip kaboom"));

    const result = await exportClosedJobToBYOKStorage("insp_1");

    expect(result.storageKey).toBe("");
    expect(supabaseUploadMock).not.toHaveBeenCalled();
    expect(queueMirrorJobMock).not.toHaveBeenCalled();
  });
});
