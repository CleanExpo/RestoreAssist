import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { authorityTemplate } from "../authority-catalogue";
import {
  buildProvenanceBlock,
  isAustralianJurisdiction,
  provenanceLines,
} from "../provenance";
import { generateAuthorityFormPDF } from "../../generate-authority-form-pdf";

/**
 * Read the drawn text back out of a saved PDF.
 *
 * Byte comparison cannot verify page CONTENT and is not a valid proxy for it:
 * these generators stamp a creation date, so two identical calls a second apart
 * already differ. pdf-lib writes text as `<hex> Tj` inside Flate-compressed
 * streams, so decode the streams and then the hex operands.
 */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let raw = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        raw += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      } catch {
        // Not a decodable stream (an embedded image, say) — nothing to read.
      }
    }
  }
  return Array.from(raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
    .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
    .join("\n");
}

const baseForm = {
  companyName: "Test Restoration",
  clientName: "A Client",
  clientAddress: "1 Example St",
  formName: "Authority for Chemical Treatment",
  authorityDescription: "Apply treatment to the affected areas.",
  date: new Date("2026-09-01T00:00:00Z"),
  signatures: [],
};

describe("provenance block", () => {
  /**
   * An empty block must be INERT, not merely flagged.
   *
   * The PDF guards on `!provenance.empty`, but removing that guard changes
   * nothing today: an empty block has no heading, no entries and no notices, so
   * the branch draws nothing either way. Sabotaging the guard did not redden
   * any test, because there is no behaviour to detect. The protection is
   * structural, so it is the STRUCTURE that has to be pinned -- give this block
   * a heading and the guard suddenly becomes load-bearing.
   */
  it("renders nothing for a template that cites no regulation", () => {
    const block = buildProvenanceBlock(authorityTemplate("AUTH_COMMENCE"), "AU");
    expect(block.empty).toBe(true);
    expect(block.heading).toBe("");
    expect(block.entries).toEqual([]);
    expect(block.notices).toEqual([]);
    expect(provenanceLines(block)).toEqual([]);
  });

  it("carries the instrument, source and check date for a cited template", () => {
    const block = buildProvenanceBlock(authorityTemplate("AUTH_CHEMICAL"), "AU");
    expect(block.empty).toBe(false);
    expect(block.entries).toHaveLength(1);
    const [entry] = block.entries;
    expect(entry.instrument).toMatch(/APVMA/);
    expect(entry.sourceUrl).toMatch(/^https:\/\//);
    expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.foreignToJob).toBe(false);
  });

  it("treats every Australian state as Australian", () => {
    for (const j of ["AU", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]) {
      expect(isAustralianJurisdiction(j)).toBe(true);
    }
    expect(isAustralianJurisdiction("NZ")).toBe(false);
  });

  /**
   * Spec 10: a New Zealand job never silently receives Australian law.
   *
   * The only citation in the catalogue is Australian and the registry holds no
   * verified New Zealand equivalent, so this case is live rather than
   * hypothetical.
   */
  it("says plainly that an Australian rule does not govern a New Zealand job", () => {
    const block = buildProvenanceBlock(authorityTemplate("AUTH_CHEMICAL"), "NZ");
    expect(block.entries[0].foreignToJob).toBe(true);
    // The warning must be FIRST: a reader who stops after one line must still
    // have been told the rule is not theirs.
    expect(block.notices[0]).toMatch(/does not govern this job/i);
    expect(block.notices[0]).toMatch(/New Zealand/);
    expect(block.notices[0]).toMatch(/no verified New Zealand equivalent/i);
  });

  it("does not warn on an Australian job", () => {
    const block = buildProvenanceBlock(authorityTemplate("AUTH_CHEMICAL"), "NSW");
    expect(block.entries[0].foreignToJob).toBe(false);
    expect(block.notices.some((n) => /does not govern this job/i.test(n))).toBe(
      false,
    );
  });

  it("always carries the not-legal-advice caution when something is cited", () => {
    for (const j of ["AU", "NZ"] as const) {
      const block = buildProvenanceBlock(authorityTemplate("AUTH_CHEMICAL"), j);
      expect(block.notices.some((n) => /not legal advice/i.test(n))).toBe(true);
    }
  });

  // Every registry entry is secondary-quoting-primary today. Disclosing that on
  // the document is strictly more informative than a hidden allow-list.
  it("discloses that the source was checked via a publication, not the regulator", () => {
    const block = buildProvenanceBlock(authorityTemplate("AUTH_CHEMICAL"), "AU");
    expect(
      block.notices.some((n) => /quoting the regulator/i.test(n)),
    ).toBe(true);
  });
});

describe("the block reaches the rendered PDF", () => {
  it("prints the instrument, source and check date on a chemical authority", async () => {
    const block = buildProvenanceBlock(authorityTemplate("AUTH_CHEMICAL"), "AU");
    const bytes = await generateAuthorityFormPDF({ ...baseForm, provenance: block });
    const text = await pdfText(bytes);

    expect(text).toMatch(/Regulatory basis/);
    expect(text).toMatch(/APVMA/);
    expect(text).toMatch(/Checked: 2026-09-01/);
    expect(text).toMatch(/not legal advice/i);
  }, 30000);

  it("prints the New Zealand warning on a New Zealand job", async () => {
    const block = buildProvenanceBlock(authorityTemplate("AUTH_CHEMICAL"), "NZ");
    const bytes = await generateAuthorityFormPDF({ ...baseForm, provenance: block });
    const text = await pdfText(bytes);
    expect(text).toMatch(/does not govern this job/i);
  }, 30000);

  /**
   * The regression that matters for existing documents: a form citing nothing,
   * or an older caller that passes no provenance at all, must render exactly as
   * before rather than growing an empty "Regulatory basis" heading.
   */
  it("adds no regulatory heading to a document that cites nothing", async () => {
    const empty = buildProvenanceBlock(authorityTemplate("AUTH_COMMENCE"), "AU");
    const withEmpty = await pdfText(
      await generateAuthorityFormPDF({ ...baseForm, provenance: empty }),
    );
    const withNone = await pdfText(await generateAuthorityFormPDF(baseForm));

    for (const text of [withEmpty, withNone]) {
      expect(text).not.toMatch(/Regulatory basis/);
      expect(text).not.toMatch(/not legal advice/i);
      // The document itself must still render.
      expect(text).toMatch(/Signatures/);
    }
  }, 30000);
});
