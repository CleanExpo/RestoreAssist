import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerate = vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]));
vi.mock("@/lib/generate-authority-form-pdf", () => ({
  generateAuthorityFormPDF: (...a: unknown[]) => mockGenerate(...a),
}));

import { renderAuthorityFormPdf } from "../render-authority-form";
import { authorityTemplate } from "../authority-catalogue";

// AUTH_CHEMICAL is the one template in the catalogue that cites the regulatory
// registry, so it is the only one whose provenance block is non-empty. Using it
// here is deliberate: a fixture built on AUTH_COMMENCE would assert against an
// empty block and pass no matter what the provenance code did.
const CHEMICAL = authorityTemplate("AUTH_CHEMICAL");

const SIGNED_AT = new Date("2026-08-30T04:00:00.000Z");

function form(over: Record<string, unknown> = {}) {
  return {
    id: "cly000000000000000abc123",
    companyName: "Wattle Restoration Pty Ltd",
    clientName: "A. Client",
    clientAddress: "12 Wattle Street, Toowoomba QLD 4350",
    incidentDate: new Date("2026-08-28T00:00:00.000Z"),
    incidentBrief: "Dishwasher supply line failed.",
    authorityDescription: "Authority to apply an antimicrobial product.",
    template: { code: CHEMICAL.code, name: CHEMICAL.name },
    signatures: [
      {
        signatoryName: "A. Client",
        signatoryRole: "Owner",
        signatureData: "data:image/png;base64,iVBORw0KGgo=",
        signedAt: SIGNED_AT,
        signatoryEmail: "client@example.com",
      },
    ],
    report: {
      claimReferenceNumber: "CLM-2026-0042",
      inspection: { propertyCountry: "AU" },
    },
    ...over,
  } as never;
}

/** The data handed to the generator — where every decision here is visible. */
function generatedWith() {
  return mockGenerate.mock.calls[0][0] as Record<string, never>;
}

describe("renderAuthorityFormPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carries the captured signature into a final render", async () => {
    await renderAuthorityFormPdf(form());
    const sigs = generatedWith().signatures as unknown as Array<{
      signatureData: string | null;
    }>;
    expect(sigs[0].signatureData).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("strips the strokes from a draft", async () => {
    // A draft is the form BEFORE it is executed. Drawing the captured signature
    // into it produces a document that looks signed and is not — which is the
    // one thing an authority form must never do.
    await renderAuthorityFormPdf(form(), { draft: true });
    const sigs = generatedWith().signatures as unknown as Array<{
      signatureData: string | null;
      signatoryName: string;
    }>;
    expect(sigs[0].signatureData).toBeNull();
    // The signatory is still named — a draft says who is being asked to sign.
    expect(sigs[0].signatoryName).toBe("A. Client");
  });

  it("builds the provenance block from the job's own country", async () => {
    await renderAuthorityFormPdf(
      form({
        report: {
          claimReferenceNumber: "CLM-1",
          inspection: { propertyCountry: "NZ" },
        },
      }),
    );
    const provenance = generatedWith().provenance as unknown as {
      notices: string[];
      empty: boolean;
    } | null;
    expect(provenance).not.toBeNull();
    expect(provenance!.empty).toBe(false);
    // An AU-cited authority rendered onto a New Zealand job must say so, and say
    // it FIRST — before the general "not legal advice" line, which a reader who
    // stops after one sentence would otherwise take as the whole caveat.
    expect(provenance!.notices[0]).toContain("does not govern this job");
  });

  it("still renders a template the code catalogue does not know", async () => {
    // A row seeded before the catalogue existed, or inserted straight into the
    // database. The form must still print; it simply carries no regulatory
    // basis, which is the truthful outcome.
    const result = await renderAuthorityFormPdf(
      form({ template: { code: "NOT-IN-CATALOGUE", name: "Legacy form" } }),
    );
    expect(generatedWith().provenance).toBeNull();
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("renders an empty block for a template that cites nothing", async () => {
    // Four of the five catalogue templates carry no registry citation today.
    // The block is `empty`, and the generator renders no section at all — an
    // empty heading with no entries under it would read as a missing document.
    await renderAuthorityFormPdf(
      form({
        template: { code: "AUTH_COMMENCE", name: "Authority to commence works" },
      }),
    );
    const provenance = generatedWith().provenance as unknown as {
      empty: boolean;
      entries: unknown[];
    };
    expect(provenance.empty).toBe(true);
    expect(provenance.entries).toEqual([]);
  });

  it("names the download by the claim reference", async () => {
    const { filename } = await renderAuthorityFormPdf(form());
    expect(filename).toBe("AUTH_CHEMICAL-CLM-2026-0042.pdf");
  });

  it("falls back to the id suffix when there is no claim reference", async () => {
    const { filename } = await renderAuthorityFormPdf(
      form({
        report: { claimReferenceNumber: null, inspection: { propertyCountry: "AU" } },
      }),
    );
    expect(filename).toBe("AUTH_CHEMICAL-abc123.pdf");
  });

  it("accepts an injected render date so callers are reproducible", async () => {
    const now = new Date("2026-09-02T00:00:00.000Z");
    await renderAuthorityFormPdf(form(), { now });
    expect(generatedWith().date).toBe(now);
  });
});

describe("renderAuthorityFormPdf, against the real generator", () => {
  it("produces bytes that are actually a PDF", async () => {
    // The mock above proves the DATA is right; nothing there would notice a
    // generator that returned an empty buffer.
    vi.resetModules();
    vi.doUnmock("@/lib/generate-authority-form-pdf");
    const { renderAuthorityFormPdf: real } = await vi.importActual<
      typeof import("../render-authority-form")
    >("../render-authority-form");
    const { bytes } = await real(form());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
