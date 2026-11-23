/**
 * RA-8604 — a typed portal signature must leave a visible mark in the signed
 * PDF. Before the fix the PDF maker ran `atob` over the typed SVG, threw, and
 * drew nothing: the legal record showed a name under an empty box.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { PDFPage } from "pdf-lib";
import { generateAuthorityFormPDF } from "../generate-authority-form-pdf";
import { typedSignatureDataUrl } from "@/lib/portal/typed-signature";

type FormArg = Parameters<typeof generateAuthorityFormPDF>[0];

// A real 1x1 PNG (public test pattern, not a secret).
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function form(signatureData: string): FormArg {
  return {
    companyName: "Acme Restoration",
    companyLogo: null,
    clientName: "Jane Homeowner",
    clientAddress: "12 Test St, Brisbane QLD 4000",
    formName: "Authority to Commence Work",
    authorityDescription: "Authorise commencement of works at the property.",
    date: new Date("2026-06-30T00:00:00Z"),
    signatures: [
      {
        signatoryName: "Jane Homeowner",
        signatoryRole: "Property Owner",
        signatureData,
        signedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ],
  };
}

function spyDrawing() {
  const texts: string[] = [];
  const text = vi
    .spyOn(PDFPage.prototype, "drawText")
    .mockImplementation(function (this: PDFPage, t: string) {
      texts.push(t);
    });
  const image = vi
    .spyOn(PDFPage.prototype, "drawImage")
    .mockImplementation(() => undefined);
  return { texts, text, image };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateAuthorityFormPDF — signature mark (RA-8604)", () => {
  it("draws the typed name from a portal typed signature", async () => {
    const { texts } = spyDrawing();
    await generateAuthorityFormPDF(form(typedSignatureDataUrl("Jane Q Homeowner")));
    // The signer's name line is "Jane Homeowner"; the mark is the typed name.
    expect(texts).toContain("Jane Q Homeowner");
    expect(texts).not.toContain("Signature on file could not be displayed");
  });

  it("builds a real PDF from a typed signature with a non-WinAnsi name", async () => {
    const bytes = await generateAuthorityFormPDF(
      form(typedSignatureDataUrl("Mārama Ōtaki")),
    );
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("embeds a drawn PNG signature", async () => {
    const { image, texts } = spyDrawing();
    await generateAuthorityFormPDF(form(PNG_1X1));
    expect(image).toHaveBeenCalled();
    expect(texts).not.toContain("Signature on file could not be displayed");
  });

  it("says so on the page when a stored value cannot be drawn", async () => {
    const { texts, image } = spyDrawing();
    await generateAuthorityFormPDF(form("data:image/svg+xml;utf8,x"));
    expect(image).not.toHaveBeenCalled();
    expect(texts).toContain("Signature on file could not be displayed");
  });
});
