/**
 * RA-7361 Bar 2 — the inspection report viewer must not hardcode Australian
 * or Queensland law onto a New Zealand job.
 *
 * RestorationInspectionReportViewer used to print WHS Act 2011, the National
 * Construction Code, and WHS Regulations 2011 on every report. This pin scans
 * the statute-bearing sentences that viewer now renders, with a QLD control
 * so a scanner that never matches cannot pass.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getStateInfo } from "@/lib/state-detection";
import {
  auQldLinkHits,
  auQldStatuteHits,
} from "@/lib/__tests__/au-qld-law-scan";
import { collectViewerComplianceProse } from "../viewer-compliance-prose";
import { recordedStateCitations } from "@/lib/state-detection";

function viewerBlob(code: "NZ" | "QLD") {
  const info = getStateInfo(code)!;
  return collectViewerComplianceProse({
    state: info.name,
    workSafetyAuthority: info.workSafetyAuthority,
    standards: [
      "IICRC S500 (Water Damage Restoration)",
      "IICRC S520 (Mould Remediation)",
      ...recordedStateCitations(info),
      "AS/NZS 3000 (Electrical wiring rules)",
    ],
    asbestosRisk: "PRE-2004_BUILDING",
    leadRisk: "PRE-1970_BUILDING",
  });
}

describe("RestorationInspectionReportViewer compliance prose (RA-7361)", () => {
  it("QLD control still surfaces Australian/Queensland statutes", () => {
    const qld = viewerBlob("QLD");
    expect(qld).toContain("Work Health and Safety Act 2011 (Qld)");
    expect(
      auQldStatuteHits(qld),
      "AU control: QLD viewer prose must still carry Australian/Queensland statutes so the NZ scan can fail",
    ).not.toEqual([]);
  });

  it("NZ jobs cite HSWA 2015 and never AU/QLD statute text or links", () => {
    const nz = viewerBlob("NZ");
    expect(nz).toContain("Health and Safety at Work Act 2015 (NZ)");
    expect(nz).toContain("WorkSafe New Zealand");
    expect(auQldStatuteHits(nz)).toEqual([]);
    expect(auQldLinkHits(nz)).toEqual([]);
  });

  it("empty-standards NZ fallback still omits NCC and WHS Act 2011", () => {
    const nzFallback = collectViewerComplianceProse({
      state: "New Zealand",
      workSafetyAuthority: "WorkSafe New Zealand",
      standards: [],
      asbestosRisk: "PRE-2000_BUILDING",
      leadRisk: "PRE-1970_BUILDING",
    });
    expect(nzFallback).toContain("Health and Safety at Work Act 2015 (NZ)");
    expect(auQldStatuteHits(nzFallback)).toEqual([]);
    expect(auQldLinkHits(nzFallback)).toEqual([]);
  });

  it("unknown jurisdiction hides Australian statutes rather than inventing them", () => {
    const unknown = collectViewerComplianceProse({
      state: null,
      workSafetyAuthority: null,
      standards: [],
      asbestosRisk: "PRE-2004_BUILDING",
      leadRisk: "PRE-1970_BUILDING",
    });
    expect(auQldStatuteHits(unknown)).toEqual([]);
    expect(auQldLinkHits(unknown)).toEqual([]);
  });

  it("the viewer source no longer hardcodes AU/QLD statutes", () => {
    // Control: the AU branch of the helper still names those statutes, so a
    // scanner that never matches cannot pass this file-level pin.
    const helper = readFileSync(
      resolve(__dirname, "../viewer-compliance-prose.ts"),
      "utf8",
    );
    expect(auQldStatuteHits(helper)).not.toEqual([]);

    const viewer = readFileSync(
      resolve(
        __dirname,
        "../../../components/RestorationInspectionReportViewer.tsx",
      ),
      "utf8",
    );
    expect(auQldStatuteHits(viewer)).toEqual([]);
    expect(auQldLinkHits(viewer)).toEqual([]);
  });
});
