import { describe, it, expect } from "vitest";
import {
  scoreReportQuality,
  type ReportQualityInput,
  type EvidenceCounts,
} from "../report-quality-score";

const fullEvidence: EvidenceCounts = {
  moistureReadings: 6,
  affectedAreas: 3,
  classifications: 1,
  scopeItems: 8,
  costEstimates: 1,
  photos: 12,
  environmentalData: true,
};

const completeReport: ReportQualityInput = {
  report: {
    clientName: "Jane Owner",
    propertyAddress: "12 Example St, Brisbane",
    propertyPostcode: "4000",
    hazardType: "Water",
    incidentDate: "2026-05-01",
    technicianAttendanceDate: "2026-05-02",
    jobNumber: "JOB-1001",
    description:
      "Executive summary of the water damage assessment. Category 2 water intrusion per IICRC S500:2025 §7.1. Exclusions: contents not assessed.",
    clientSummaryCache:
      "Your property had a Category 2 water event. What this means for you: drying is underway.",
    technicianFieldReport: "Skirting wet to 600mm. Subfloor reading taken.",
  },
  client: {
    name: "Jane Owner",
    email: "jane@example.com",
    phone: "0400000000",
  },
  inspection: fullEvidence,
};

describe("scoreReportQuality", () => {
  it("scores a complete, neutral, IICRC-cited report highly (A/B, no neutral-language flags)", () => {
    const r = scoreReportQuality(completeReport);
    expect(r.composite).toBeGreaterThanOrEqual(85);
    expect(["A", "B"]).toContain(r.grade);
    expect(r.flags.neutralLanguage).toHaveLength(0);
    expect(r.flags.iicrcReadiness).toHaveLength(0);
    // every dimension is present
    expect(r.dimensions.map((d) => d.key).sort()).toEqual(
      [
        "clientUsability",
        "evidence",
        "iicrcReadiness",
        "metadata",
        "neutralLanguage",
      ].sort(),
    );
  });

  it("flags an empty report as failing with actionable missing evidence", () => {
    const r = scoreReportQuality({
      report: {},
      client: null,
      inspection: null,
    });
    expect(r.grade).toBe("F");
    expect(r.composite).toBeLessThan(40);
    // evidence dimension reports the missing inspection explicitly
    expect(r.missingEvidence.join(" ")).toMatch(/Link an inspection/);
    expect(r.missingEvidence.join(" ")).toMatch(/Add Client name/);
    // missing-evidence is a de-duplicated flat list
    expect(new Set(r.missingEvidence).size).toBe(r.missingEvidence.length);
  });

  it("flags unsupported causation and legal/insurance advice for review (does not rewrite)", () => {
    const r = scoreReportQuality({
      ...completeReport,
      report: {
        ...completeReport.report,
        technicianFieldReport:
          "The damage was caused by negligence of the builder. You should make a claim — it is covered by your insurance.",
      },
    });
    expect(r.flags.neutralLanguage.length).toBeGreaterThan(0);
    const neutralDim = r.dimensions.find((d) => d.key === "neutralLanguage")!;
    expect(neutralDim.score).toBeLessThan(100);
    expect(neutralDim.issues.join(" ")).toMatch(/causation/i);
    expect(neutralDim.issues.join(" ")).toMatch(/advice/i);
  });

  it("flags a likely-missing IICRC reference as review assistance, not a compliance claim", () => {
    const r = scoreReportQuality({
      report: {
        clientName: "X",
        propertyAddress: "Y",
        hazardType: "Water",
        description: "General notes with no standard reference.",
      },
      inspection: fullEvidence,
    });
    expect(r.flags.iicrcReadiness.length).toBeGreaterThan(0);
    const iicrcDim = r.dimensions.find((d) => d.key === "iicrcReadiness")!;
    expect(iicrcDim.issues.join(" ")).toMatch(/review assistance/i);
    expect(iicrcDim.issues.join(" ")).not.toMatch(
      /certif|compliant|guarantee/i,
    );
  });

  it("composite stays within 0–100 and weights re-normalise", () => {
    const r = scoreReportQuality(completeReport);
    expect(r.composite).toBeGreaterThanOrEqual(0);
    expect(r.composite).toBeLessThanOrEqual(100);
    const total = r.dimensions.reduce((s, d) => s + d.weight, 0);
    expect(total).toBeCloseTo(0.85, 5); // 0.15+0.30+0.15+0.15+0.10
  });
});
