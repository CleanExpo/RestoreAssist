import { describe, it, expect, vi, afterEach } from "vitest";
import { generateAuthorityFormPDF } from "../generate-authority-form-pdf";

// STORM T9 — authority-form PDF generation smoke (Linda/Marcus — the
// insurer/manager-facing document output). Previously untested; this guards
// against a regression that throws or emits an empty/garbage buffer.

// Derive the real parameter type so the fixture is type-checked against the
// generator's actual contract (no `as never` escape hatch).
type FormArg = Parameters<typeof generateAuthorityFormPDF>[0];

function baseForm(overrides: Partial<FormArg> = {}): FormArg {
  return {
    companyName: "Acme Restoration",
    companyLogo: null,
    clientName: "Jane Homeowner",
    clientAddress: "12 Test St, Brisbane QLD 4000",
    formName: "Authority to Commence Work",
    authorityDescription:
      "Authorise commencement of water-damage restoration works at the property.",
    date: new Date("2026-06-30T00:00:00Z"),
    signatures: [
      {
        signatoryName: "Jane Homeowner",
        signatoryRole: "Property Owner",
        signatureData: null,
        signedAt: null,
      },
    ],
    ...overrides,
  };
}

function header(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 5));
}

describe("generateAuthorityFormPDF", () => {
  it("produces a non-empty, well-formed PDF byte stream", async () => {
    const bytes = await generateAuthorityFormPDF(baseForm());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000); // a real PDF, not an empty stub
    expect(header(bytes)).toBe("%PDF-"); // valid PDF magic number
  });

  it("does not throw when there are no signatures yet (unsigned draft)", async () => {
    const bytes = await generateAuthorityFormPDF(baseForm({ signatures: [] }));
    expect(bytes.length).toBeGreaterThan(1000);
    expect(header(bytes)).toBe("%PDF-");
  });
});

describe("generateAuthorityFormPDF — logo SSRF guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["file:///etc/passwd"],
    ["http://169.254.169.254/latest/meta-data/"],
    ["http://localhost:9000/internal"],
    ["http://10.0.0.1/private-logo.png"],
  ])(
    "never fetches a private/non-http companyLogo (%s) and still emits a PDF",
    async (badUrl) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const bytes = await generateAuthorityFormPDF(
        baseForm({ companyLogo: badUrl }),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(bytes.length).toBeGreaterThan(1000);
      expect(header(bytes)).toBe("%PDF-");
    },
  );
});
