// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { REPORT_THEMES } from "@/lib/report-experience/catalog";
import type { ReportExperienceSnapshot } from "@/lib/report-experience/snapshot";
import { ReportDesignStudio } from "../ReportDesignStudio";

afterEach(() => cleanup());

const DIGEST = "ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12";

function makeSnapshot(over: Partial<ReportExperienceSnapshot> = {}): ReportExperienceSnapshot {
  return {
    schemaVersion: 1,
    reportId: "rep_9001",
    organisationId: "org_77",
    revision: "rev-C4",
    revisionCreatedAt: "2026-10-20T01:00:00.000Z",
    reportNumber: "RA-2026-0457",
    status: "Issued for review",
    brand: { businessName: "Harbour Restoration Pty Ltd" },
    propertyAddress: "12 Wattle Street, Carlton VIC 3053",
    safetyAssessment: "PENDING_VERIFICATION",
    hazards: [
      { id: "h1", title: "Exposed switchboard wiring", action: "Isolate circuit before entry", verification: "unverified" },
      { id: "h2", title: "Slip hazard on tiled entry", action: "Signage placed", verification: "verified" },
    ],
    moistureReadings: [
      { id: "r1", roomId: "room_kitchen", observedAt: "2026-10-18T09:30:00.000Z", value: 42.5, unit: "WME" },
      { id: "r2", roomId: "room_hall", observedAt: "2026-10-19T09:45:00.000Z", value: 31.2, unit: "RH_PERCENT" },
    ],
    scopeItems: [
      { id: "s1", description: "Extract standing water from kitchen", approvalStatus: "authorised" },
      { id: "s2", description: "Remove wet plasterboard in hall", approvalStatus: "proposed" },
    ],
    financials: { estimatedTotalCents: 482550, currency: "AUD", estimateStatus: "draft" },
    sourceRefs: [{ kind: "inspection", id: "insp_1" }],
    audience: "owner",
    contentDigestSha256: DIGEST,
    ...over,
  };
}

function reportFor(label: string) {
  return screen.getByRole("article", { name: new RegExp(label + " report preview", "i") });
}

describe("ReportDesignStudio with a snapshot", () => {
  it("shows the snapshot values and provenance", () => {
    render(<ReportDesignStudio snapshot={makeSnapshot()} />);
    const report = reportFor("Executive Modern");
    const text = report.textContent ?? "";
    expect(text).toContain("RA-2026-0457");
    expect(text).toContain("Issued for review");
    expect(text).toContain("Harbour Restoration Pty Ltd");
    expect(text).toContain("12 Wattle Street, Carlton VIC 3053");
    expect(text).toContain("Exposed switchboard wiring");
    expect(text).toContain("42.5");
    expect(text).toContain("room_kitchen");
    expect(text).toContain("2026-10-18T09:30:00.000Z");
    expect(text).toContain("Extract standing water from kitchen");
    expect(text).toContain("$4,825.50");
    expect(text).toContain("rev-C4");
    expect(text).toContain(DIGEST);
  });

  it("shows hazard verification and scope approval state", () => {
    render(<ReportDesignStudio snapshot={makeSnapshot()} />);
    const report = reportFor("Executive Modern");
    expect(within(report).getAllByText(/^Unverified$/).length).toBe(1);
    expect(within(report).getAllByText(/^Verified$/).length).toBe(1);
    expect(within(report).getByText(/^Authorised$/)).toBeTruthy();
    expect(within(report).getByText(/^Proposed$/)).toBeTruthy();
  });

  it("renders no synthetic sample value and does not call itself synthetic", () => {
    const { container } = render(<ReportDesignStudio snapshot={makeSnapshot()} />);
    const text = container.textContent ?? "";
    for (const sample of ["SAMPLE REPORT 0001", "Possible electrical exposure", "Moisture under floor finish", "Living room", "Air mover", "DESIGN LAB", "Day 1", "13.8"]) {
      expect(text).not.toContain(sample);
    }
    expect(text).not.toMatch(/synthetic/i);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/synthetic/i);
  });

  it("without a snapshot still says synthetic sample", () => {
    render(<ReportDesignStudio />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/synthetic sample/i);
  });

  it("shows NOT_ASSESSED as not assessed, never as safe", () => {
    render(<ReportDesignStudio snapshot={makeSnapshot({ safetyAssessment: "NOT_ASSESSED", hazards: [] })} />);
    const note = screen.getByRole("note", { name: /Safety assessment/i });
    expect(note.textContent).toMatch(/not assessed/i);
    expect(note.textContent).not.toMatch(/\bsafe\b/i);
  });

  it("shows plain no-evidence sentences for empty sections", () => {
    render(<ReportDesignStudio snapshot={makeSnapshot({ hazards: [], moistureReadings: [], scopeItems: [], sourceRefs: [] })} />);
    const text = reportFor("Executive Modern").textContent ?? "";
    expect(text).toContain("No moisture readings recorded for this report.");
    expect(text).toContain("No hazards recorded for this report.");
    expect(text).toContain("No scope items recorded for this report.");
    expect(reportFor("Executive Modern").querySelectorAll("table").length).toBe(0);
  });

  it("shows no money and no address when financials and address are absent", () => {
    const base = makeSnapshot();
    const { financials: _f, propertyAddress: _a, ...rest } = base;
    const snap: ReportExperienceSnapshot = rest;
    render(<ReportDesignStudio snapshot={snap} />);
    const text = reportFor("Executive Modern").textContent ?? "";
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/AUD|NZD/);
    expect(text).not.toContain("Wattle");
    expect(text).toContain("No financial estimate supplied for this report.");
  });

  it("every one of the ten styles shows the same readings, safety facts and provenance", () => {
    render(<ReportDesignStudio snapshot={makeSnapshot()} />);
    const layouts = new Set<string>();
    for (const theme of REPORT_THEMES) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(theme.label, "i") }));
      const report = reportFor(theme.label);
      expect(report.getAttribute("data-theme")).toBe(theme.id);
      layouts.add(report.getAttribute("data-layout") ?? "");
      const text = report.textContent ?? "";
      for (const needle of ["42.5", "31.2", "room_kitchen", "room_hall", "2026-10-18T09:30:00.000Z", "RA-2026-0457", "Exposed switchboard wiring", "Unverified", "pending verification", "$4,825.50", "rev-C4", DIGEST]) {
        expect(text, theme.id + " missing " + needle).toContain(needle);
      }
      expect(text).not.toContain("36");
    }
    expect(layouts.size).toBeGreaterThan(1);
  });
});
