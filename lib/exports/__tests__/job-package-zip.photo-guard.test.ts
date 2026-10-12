import { describe, it, expect, vi, beforeEach } from "vitest";

// RA-7879 round 2: the close and handover ZIPs fetched InspectionPhoto.url as
// given, from the server. They must use the same photo URL guard as reports:
// storage objects of this inspection (signed), our own Cloudinary photos (as
// stored), and nothing else ever reaches fetch.
const inspectionFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...a: unknown[]) => inspectionFindUnique(...a),
    },
  },
}));
vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: vi.fn(),
}));
vi.mock("@/lib/documents/render-authority-form", () => ({
  AUTHORITY_FORM_RENDER_INCLUDE: {},
  renderAuthorityFormPdf: vi.fn(),
}));

const signStoredMediaUrl = vi.fn(async (url: string | null | undefined) =>
  url ? `${url}?token=signed` : url,
);
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  signStoredMediaUrl: (u: string | null | undefined) => signStoredMediaUrl(u),
}));

import { buildJobPackageStream } from "../job-package-zip";

const HOST = "https://abc.supabase.co";
const CLOUD = "ra-cloud";
const STORAGE = `${HOST}/storage/v1/object/public/evidence-optimised/org-1/insp-1/a.jpg`;
const OURS = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/inspection-photos/b.jpg`;
const METADATA = "http://169.254.169.254/latest/meta-data/";
const LOCAL_DB = "http://localhost:5432/";
const LOOKALIKE = `https://res.cloudinary.com.evil.com/${CLOUD}/image/upload/c.jpg`;

const fetchSpy = vi.fn(async (_url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
  vi.stubEnv("CLOUDINARY_CLOUD_NAME", CLOUD);
  vi.stubEnv("CLOUDINARY_URL", "");
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  signStoredMediaUrl.mockClear();
  inspectionFindUnique.mockResolvedValue({
    id: "insp-1",
    inspectionNumber: "INS-1",
    userId: "u1",
    workspaceId: null,
    user: { organizationId: "org-1" },
    reportId: null,
    report: null,
    auditLogs: [],
    photos: [
      { id: "meta", url: METADATA, mimeType: "image/jpeg", timestamp: new Date() },
      { id: "db", url: LOCAL_DB, mimeType: "image/jpeg", timestamp: new Date() },
      { id: "lookalike", url: LOOKALIKE, mimeType: "image/jpeg", timestamp: new Date() },
      { id: "storage", url: STORAGE, mimeType: "image/jpeg", timestamp: new Date() },
      { id: "cloudinary", url: OURS, mimeType: "image/jpeg", timestamp: new Date() },
    ],
  });
});

describe("buildJobPackageStream photo guard (RA-7879)", () => {
  it("never fetches an internal or lookalike URL, and packages storage and our Cloudinary photos", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buffer } = await buildJobPackageStream("insp-1");

    const fetched = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(fetched.some((u) => u.includes("169.254.169.254"))).toBe(false);
    expect(fetched.some((u) => u.includes("localhost"))).toBe(false);
    expect(fetched.some((u) => u.includes("evil.com"))).toBe(false);
    // Private storage is signed before fetching; our Cloudinary is fetched as stored.
    expect(fetched).toEqual([`${STORAGE}?token=signed`, OURS]);

    const zip = buffer.toString("latin1");
    expect(zip).toContain("photos/storage.jpeg");
    expect(zip).toContain("photos/cloudinary.jpeg");
    expect(zip).not.toContain("photos/meta.");
    expect(zip).not.toContain("photos/db.");
    expect(zip).not.toContain("photos/lookalike.");
    error.mockRestore();
  });
});
