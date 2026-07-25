/**
 * RA-7090 round 4 (MUST-FIX A): END-TO-END rendering test for the dispute
 * pack. Adapted from the review harness.
 *
 * Why this exists and why it does NOT test the helper: round 3 asserted on
 * signedCaptureLabel's RETURN VALUE, which passed while the rendered page
 * showed nothing — sanitize() flattened the newline and the 80pt Timestamp
 * column truncated the receipt time away, so the only "Rec:" in the whole
 * document was the legend telling the reader to look for a marker the table
 * never printed. That is the false-green class this suite is meant to kill.
 *
 * These tests therefore generate a REAL PDF, inflate the content streams and
 * assert on the strings actually drawn on the page.
 */
import { describe, it, expect } from "vitest";
import { inflateSync } from "zlib";
import { generateDisputePack } from "../dispute-pack";

// A 29-day backdate: INSIDE the MAX_CAPTURE_BACKDATE_MS bound, so a signed
// manifest carrying it is legitimately accepted — which is exactly why the
// reader must also see when the server received the bytes.
const CAPTURED = new Date("2026-06-26T02:30:00.000Z");
const RECEIVED = new Date("2026-07-25T09:15:00.000Z");

function inspectionFixture(evidenceOverrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    inspectionNumber: "INS-0001",
    propertyAddress: "1 Test St, Sydney",
    propertyPostcode: "2000",
    technicianName: "Tech One",
    inspectionDate: RECEIVED,
    status: "SUBMITTED",
    createdAt: RECEIVED,
    submittedAt: RECEIVED,
    processedAt: RECEIVED,
    userId: "u1",
    classifications: [],
    affectedAreas: [],
    moistureReadings: [],
    scopeItems: [],
    costEstimates: [],
    evidenceItems: [
      {
        evidenceClass: "PHOTO_DAMAGE",
        title: "front-room.jpg",
        description: "signed capture",
        capturedByName: "Tech One",
        capturedAt: CAPTURED,
        createdAt: RECEIVED,
        capturedLat: -33.8688,
        capturedLng: 151.2093,
        hashSha256: "a".repeat(64),
        structuredData: JSON.stringify({ signedManifestVerified: true }),
        ...evidenceOverrides,
      },
    ],
  };
}

function fakePrisma(inspection: unknown) {
  return {
    inspection: { findUnique: async () => inspection },
  } as never;
}

/** Pull every literal drawn by pdf-lib out of the Flate-compressed streams. */
function extractDrawnText(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const out: string[] = [];
  const collect = (text: string) => {
    const re = /<([0-9A-Fa-f]+)>\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push(Buffer.from(m[1], "hex").toString("latin1"));
    }
  };
  collect(buf.toString("latin1"));
  const marker = Buffer.from("stream");
  let idx = buf.indexOf(marker);
  while (idx !== -1) {
    let start = idx + marker.length;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const end = buf.indexOf(Buffer.from("endstream"), start);
    if (end === -1) break;
    try {
      collect(inflateSync(buf.subarray(start, end)).toString("latin1"));
    } catch {
      /* not a Flate stream */
    }
    idx = buf.indexOf(marker, end + 9);
  }
  return out;
}

async function drawnTextFor(inspection: unknown): Promise<string[]> {
  const bytes = await generateDisputePack("i1", "u1", fakePrisma(inspection));
  return extractDrawnText(bytes);
}

describe("dispute pack rendering — server receipt time (MUST-FIX A)", () => {
  it("RENDERS the receipt time on the page for a backdated signed capture", async () => {
    const drawn = await drawnTextFor(inspectionFixture());

    // The receipt time is actually drawn — not merely returned by a helper.
    const receiptCells = drawn.filter((t) => t.includes("Rec:"));
    expect(receiptCells.length).toBeGreaterThan(0);

    // And it is a DATA cell carrying the real receipt date, not just the
    // legend sentence that explains the marker.
    const receiptDataCell = receiptCells.find(
      (t) => t.includes("25 July 2026") && !t.includes("received the evidence"),
    );
    expect(receiptDataCell).toBeDefined();
    // Nothing truncated it away.
    expect(receiptDataCell).not.toContain("...");
  });

  it("still prints the device-claimed capture date, so the two are comparable", async () => {
    const drawn = await drawnTextFor(inspectionFixture());
    expect(drawn.some((t) => t.includes("26 June 2026"))).toBe(true);
    expect(drawn.some((t) => t.includes("25 July 2026"))).toBe(true);
  });

  it("draws the capture cell in full — the 80pt column no longer truncates it", async () => {
    const drawn = await drawnTextFor(inspectionFixture());
    const captureCell = drawn.find((t) => /^26 June 2026, \d{2}:\d{2}$/.test(t));
    expect(captureCell).toBeDefined();
    expect(captureCell).not.toContain("...");
  });

  it("keeps the legend's promise honest — the marker it describes is on the page", async () => {
    const drawn = await drawnTextFor(inspectionFixture());
    const joined = drawn.join(" ");
    expect(joined).toContain("received the evidence");
    // The legend describes "Rec:"; a data cell must actually show it.
    const dataCells = drawn.filter((t) => !t.includes("received the evidence"));
    expect(dataCells.some((t) => t.includes("Rec:"))).toBe(true);
  });

  it("omits the receipt line when capture and receipt render identically", async () => {
    const drawn = await drawnTextFor(
      inspectionFixture({ capturedAt: RECEIVED, createdAt: RECEIVED }),
    );
    const dataCells = drawn.filter((t) => !t.includes("received the evidence"));
    // No redundant second line when there is nothing to distinguish.
    expect(dataCells.some((t) => t.includes("Rec:"))).toBe(false);
    expect(drawn.some((t) => t.includes("25 July 2026"))).toBe(true);
  });

  it("still renders the custody hash and GPS alongside both times", async () => {
    const drawn = await drawnTextFor(inspectionFixture());
    const joined = drawn.join(" ");
    // Short custody hash (first 8 of the sha256) and the GPS fix.
    expect(joined).toContain("aaaaaaaa");
    expect(joined).toContain("-33.8688");
  });
});
