import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import {
  complianceAsbestosRows,
  complianceJobPartyRows,
} from "../australian-compliance-report";

// RA-8600: the Australian Compliance record must reach the report PDF.
async function pdfText(data: Parameters<typeof generateIICRCReportPDF>[0]): Promise<string> {
  const bytes = await generateIICRCReportPDF(data, {});
  const parser = new PDFParse({ data: bytes });
  return (await parser.getText()).text.replace(/\s+/g, " ");
}

const FILLED = {
  lossAdjusterName: "Harbour Loss Adjusting",
  lossAdjusterReference: "HLA-77812",
  technicianCertification: "WRT",
  technicianLicenseNumber: "NSW-LIC-40291",
  asbestosRiskAcknowledged: true,
  friableAssessment: "Non-friable ACM eaves lining, undisturbed",
  workHalted: true,
  licensedAssessorName: "Jordan Pike",
  licensedAssessorLicense: "LAA001234",
  removalQuoteAud: { toString: () => "4850.00" },
  separateInvoiceRequired: true,
};

// The schema defaults a saved row carries when nothing was entered.
const DEFAULTS_ONLY = {
  asbestosRiskAcknowledged: false,
  workHalted: false,
  separateInvoiceRequired: true,
  iicrcCertifiedTechnician: false,
};

describe("Australian Compliance rows (RA-8600)", () => {
  it("returns no rows for a missing or defaults-only record", () => {
    for (const r of [null, undefined, {}, DEFAULTS_ONLY]) {
      expect(complianceAsbestosRows(r)).toEqual([]);
      expect(complianceJobPartyRows(r)).toEqual([]);
    }
  });

  it("prints separate invoice only beside a recorded quote", () => {
    expect(complianceAsbestosRows({ separateInvoiceRequired: false })).toEqual([]);
    expect(Object.fromEntries(complianceAsbestosRows({ removalQuoteAud: 0, separateInvoiceRequired: false }))).toEqual({
      "Removal quote:": "$0.00",
      "Separate invoice required:": "No",
    });
  });
});

describe("report PDF (RA-8600 acceptance)", () => {
  it("prints the asbestos facts and job parties from a filled record", async () => {
    const text = await pdfText({ id: "ra8600-filled", australianCompliance: FILLED });
    expect(text).toContain("ASBESTOS");
    expect(text).toContain("Asbestos risk acknowledged: Yes");
    expect(text).toContain("Friable assessment: Non-friable ACM eaves lining, undisturbed");
    expect(text).toContain("Work halted: Yes");
    expect(text).toContain("Licensed assessor: Jordan Pike");
    expect(text).toContain("Assessor licence No.: LAA001234");
    expect(text).toContain("Removal quote: $4,850.00");
    expect(text).toContain("Separate invoice required: Yes");
    expect(text).toContain("Technician Certification: WRT - Water Damage");
    expect(text).toContain("Technician Licence No.: NSW-LIC-40291");
    expect(text).toContain("Loss Adjuster: Harbour Loss Adjusting");
    expect(text).toContain("Loss Adjuster Reference: HLA-77812");
  });

  it("prints nothing for an empty record", async () => {
    for (const rec of [null, DEFAULTS_ONLY]) {
      const text = await pdfText({ id: "ra8600-empty", australianCompliance: rec });
      expect(text).not.toMatch(/ASBESTOS|Asbestos risk|Work halted|Licensed assessor|Removal quote|Separate invoice/);
      expect(text).not.toMatch(/Technician Certification|Technician Licence|Loss Adjuster/);
    }
  });
});
