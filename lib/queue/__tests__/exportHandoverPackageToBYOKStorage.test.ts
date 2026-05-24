/**
 * P1 #10 — handover package builds with client co-brand theme.
 *
 * Asserts that exportHandoverPackageToBYOKStorage:
 *   - resolves the client's brandLogoUrl + brandPrimaryColor (via the
 *     inspection → report → client chain)
 *   - passes that theme to buildJobPackageStream
 *   - falls back to RA defaults when the client has no brand fields
 *
 * The ZIP write + mirror enqueue paths are exercised by the SP-E close-
 * package test; we don't re-test them here.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  RA_DEFAULT_PRIMARY_COLOR,
  RA_DEFAULT_LOGO_URL,
} from "@/lib/clients/brand";

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

import { exportHandoverPackageToBYOKStorage } from "@/lib/queue/exportHandoverPackageToBYOKStorage";

beforeEach(() => {
  vi.clearAllMocks();
  buildJobPackageStreamMock.mockResolvedValue({
    buffer: Buffer.from("zip-bytes"),
    byteSize: 9,
  });
  queueMirrorJobMock.mockResolvedValue("mirror_job_1");
  supabaseUploadMock.mockResolvedValue({ error: null });
});

describe("exportHandoverPackageToBYOKStorage — client co-brand theme", () => {
  it("passes the client's brandLogoUrl + brandPrimaryColor to the ZIP builder", async () => {
    inspectionMock.findUnique.mockResolvedValue({
      id: "insp_1",
      user: { organizationId: "org_1" },
      report: {
        client: {
          brandLogoUrl: "https://cdn.example.com/acme.png",
          brandPrimaryColor: "#FF6600",
        },
      },
    });

    await exportHandoverPackageToBYOKStorage("insp_1");

    expect(buildJobPackageStreamMock).toHaveBeenCalledWith("insp_1", {
      theme: {
        logoUrl: "https://cdn.example.com/acme.png",
        primaryColor: "#FF6600",
      },
    });
  });

  it("falls back to RA defaults when the client has no brand fields", async () => {
    inspectionMock.findUnique.mockResolvedValue({
      id: "insp_2",
      user: { organizationId: "org_1" },
      report: {
        client: { brandLogoUrl: null, brandPrimaryColor: null },
      },
    });

    await exportHandoverPackageToBYOKStorage("insp_2");

    expect(buildJobPackageStreamMock).toHaveBeenCalledWith("insp_2", {
      theme: {
        logoUrl: RA_DEFAULT_LOGO_URL,
        primaryColor: RA_DEFAULT_PRIMARY_COLOR,
      },
    });
  });

  it("falls back when the inspection has no linked report or client", async () => {
    inspectionMock.findUnique.mockResolvedValue({
      id: "insp_3",
      user: { organizationId: "org_1" },
      report: null,
    });

    await exportHandoverPackageToBYOKStorage("insp_3");

    expect(buildJobPackageStreamMock).toHaveBeenCalledWith("insp_3", {
      theme: {
        logoUrl: RA_DEFAULT_LOGO_URL,
        primaryColor: RA_DEFAULT_PRIMARY_COLOR,
      },
    });
  });
});
