import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-7746: the sketch PDF is branded with the BUSINESS — the workspace owner's
// saved business name and logo — whoever in the workspace owns the inspection.
// It used to read the inspection owner's own User row, so a technician's
// sketch PDF came out unbranded (their own businessName is empty).

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn().mockResolvedValue({ ok: true }),
}));

const inspectionFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...a: unknown[]) => inspectionFindUnique(...a),
    },
    material: { findMany: vi.fn().mockResolvedValue([]) },
    claimSketch: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const generateSketchPdf = vi.fn();
vi.mock("@/lib/generate-sketch-pdf", () => ({
  generateSketchPdf: (...a: unknown[]) => generateSketchPdf(...a),
}));
vi.mock("@/lib/restoration/fetch-plan-inputs", () => ({
  PLAN_INPUT_SELECT: {},
  planInputsFromRow: () => ({}),
}));
vi.mock("@/lib/sketch/measured-sketch-data", () => ({
  serverAuthoritativeFloors: (floors: unknown) => floors,
}));
vi.mock("@/lib/reports/claim-sketch-floors", () => ({
  claimSketchesToFloors: vi.fn().mockResolvedValue([{ label: "Ground" }]),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { status: number }) =>
    new Response("e", { status: o.status }),
  fromException: () => new Response("e", { status: 500 }),
}));

import { POST } from "../route";

const req = () =>
  new NextRequest("http://localhost/api/inspections/insp-1/sketches/pdf", {
    method: "POST",
    body: JSON.stringify({ floors: [] }),
  });
const ctx = { params: Promise.resolve({ id: "insp-1" }) };

type FindArgs = { select: { user: { select: Record<string, unknown> } } };

// The inspection row as the DB returns it for the route's own select: the
// inspection's owner is projected through whatever select the route asks for.
function serveInspectionOwnedBy(
  userId: string,
  fixture = makeTwoWorkspaces(),
) {
  inspectionFindUnique.mockImplementation(async (args: FindArgs) => ({
    id: "insp-1",
    propertyAddress: "1 Test Street",
    user: project(fixture.userRow(userId), args.select.user.select),
  }));
}

function branding() {
  return generateSketchPdf.mock.calls[0][0].branding as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindUnique.mockReset();
  generateSketchPdf.mockReset();
  generateSketchPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  getServerSession.mockResolvedValue({ user: { id: "tech-a" } });
});

describe("POST /api/inspections/[id]/sketches/pdf — business branding (RA-7746)", () => {
  it("control: the owner's own sketch PDF carries the owner's business", async () => {
    serveInspectionOwnedBy("owner-a");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(branding().businessName).toBe("Harbour Restorations");
  });

  it("a technician's sketch PDF carries the workspace owner's business", async () => {
    serveInspectionOwnedBy("tech-a");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(branding().businessName).toBe("Harbour Restorations");
    expect(branding().businessLogo).toBe(
      "https://img.example/harbour-logo.png",
    );
  });

  it("never takes another workspace's business details", async () => {
    serveInspectionOwnedBy("tech-a");
    await POST(req(), ctx);
    expect(JSON.stringify(branding())).not.toMatch(/Rival|rival/);
  });

  it("falls back to the technician's own details when the owner saved none", async () => {
    serveInspectionOwnedBy(
      "tech-a",
      makeTwoWorkspaces({
        users: {
          "owner-a": { businessName: null },
          "tech-a": { businessName: "Tess Drying Services" },
        },
      }),
    );
    await POST(req(), ctx);
    expect(branding().businessName).toBe("Tess Drying Services");
  });
});
