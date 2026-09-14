import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const claimSketchFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    claimSketch: { findMany: (...a: unknown[]) => claimSketchFindMany(...a) },
  },
}));

const PNG_17x13 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAANCAIAAADAGxJNAAAAFklEQVR42mO4srSEVMQwqmdUDx31AABidKmpPSOQawAAAABJRU5ErkJggg==";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/sketch-pdf-embed", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let raw = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        raw += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      } catch {
        /* image */
      }
    }
  }
  return Array.from(raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
    .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
    .join("\n");
}

async function embeddedImageSizes(
  pdfBytes: Uint8Array,
): Promise<Array<{ w: number; h: number }>> {
  const doc = await PDFDocument.load(pdfBytes);
  const sizes: Array<{ w: number; h: number }> = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (String(obj.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
    sizes.push({
      w: Number(obj.dict.get(PDFName.of("Width"))),
      h: Number(obj.dict.get(PDFName.of("Height"))),
    });
  }
  return sizes;
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  claimSketchFindMany.mockReset();
});

describe("POST /api/test/sketch-pdf-embed", () => {
  it("returns 404 when test helpers are blocked", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(makeReq({ inspectionId: "i1", pngDataUrl: PNG_17x13 }));
    expect(res.status).toBe(404);
    expect(inspectionFindFirst).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns 401 when there is no session", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce(null);
    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(makeReq({ inspectionId: "i1", pngDataUrl: PNG_17x13 }));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("returns 409 when the persisted sketch has no damage markers", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u1" } });
    inspectionFindFirst.mockResolvedValueOnce({
      id: "i1",
      propertyAddress: "12 Test Street",
    });
    claimSketchFindMany.mockResolvedValueOnce([
      { floorLabel: "Ground Floor", sketchData: { objects: [] } },
    ]);
    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(makeReq({ inspectionId: "i1", pngDataUrl: PNG_17x13 }));
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/no damage markers/i);
    vi.unstubAllEnvs();
  });

  it("embeds persisted marker copy and the floor PNG on the report page", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u1" } });
    inspectionFindFirst.mockResolvedValueOnce({
      id: "insp-2953-embed",
      propertyAddress: "12 Test Street, Melbourne VIC 3000",
    });
    claimSketchFindMany.mockResolvedValueOnce([
      {
        floorLabel: "Ground Floor",
        sketchData: {
          objects: [],
          damageMarkers: [
            {
              id: "dm-e2e-1",
              type: "water_cat3",
              severity: "high",
              room_label: "Kitchen",
              notes: "Black water at kitchen sink",
              x: 150,
              y: 200,
              nx: 0.35,
              ny: 0.4,
            },
          ],
        },
      },
    ]);
    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(
      makeReq({ inspectionId: "insp-2953-embed", pngDataUrl: PNG_17x13 }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/pdf/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const text = await pdfText(bytes);
    expect(text).toContain("C3 Kitchen");
    expect(text).toContain("Black water at kitchen sink");
    expect(text).toContain("Water Cat 3");
    expect(text).toContain("Damage markers");
    expect(await embeddedImageSizes(bytes)).toContainEqual({ w: 17, h: 13 });
    vi.unstubAllEnvs();
  });
});
