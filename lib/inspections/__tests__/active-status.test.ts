import { describe, expect, it } from "vitest";
import { InspectionStatus } from "@prisma/client";
import {
  ACTIVE_INSPECTION_STATUSES,
  GUIDEWIRE_EXPORT_INSPECTION_STATUSES,
  PULSE_DIGEST_INSPECTION_STATUSES,
  SIGN_OFF_INSPECTION_STATUSES,
  SUBMITTED_OR_LATER_INSPECTION_STATUSES,
  inspectionStatusAllowsGuidewireExport,
  inspectionStatusAllowsSignOff,
  DISPUTE_PACK_INSPECTION_STATUSES,
  INACTIVE_INSPECTION_STATUSES,
  NIR_REPORT_INSPECTION_STATUSES,
  inspectionStatusAllowsDisputePack,
  inspectionStatusAllowsNirReport,
  isActiveInspectionStatus,
} from "../active-status";

describe("isActiveInspectionStatus", () => {
  it("treats finished jobs as not active", () => {
    for (const status of ["COMPLETED", "REJECTED", "CLOSED", "ARCHIVED"]) {
      expect(isActiveInspectionStatus(status)).toBe(false);
    }
  });

  it("keeps a job awaiting payment active", () => {
    expect(isActiveInspectionStatus("IN_BILLING")).toBe(true);
  });

  it("only names statuses the database can hold, so a Prisma filter cannot throw", () => {
    const known = Object.values(InspectionStatus) as string[];
    for (const status of INACTIVE_INSPECTION_STATUSES) {
      expect(known).toContain(status);
    }
  });
});

describe("dispute pack and NIR report states (RA-8421)", () => {
  it("allows the dispute pack once the invoice is issued and after close", () => {
    for (const status of [
      "SUBMITTED",
      "COMPLETED",
      "IN_BILLING",
      "CLOSED",
      "ARCHIVED",
    ]) {
      expect(inspectionStatusAllowsDisputePack(status)).toBe(true);
    }
    for (const status of ["DRAFT", "ESTIMATED", "REJECTED", null, undefined]) {
      expect(inspectionStatusAllowsDisputePack(status)).toBe(false);
    }
  });

  it("allows the NIR report from review-ready onwards, including invoiced and closed jobs", () => {
    for (const status of [
      "ESTIMATED",
      "SUBMITTED",
      "COMPLETED",
      "IN_BILLING",
      "CLOSED",
      "ARCHIVED",
    ]) {
      expect(inspectionStatusAllowsNirReport(status)).toBe(true);
    }
    for (const status of ["DRAFT", "PROCESSING", "REJECTED", null]) {
      expect(inspectionStatusAllowsNirReport(status)).toBe(false);
    }
  });

  it("only names statuses the database can hold", () => {
    const known = Object.values(InspectionStatus) as string[];
    for (const status of [
      ...DISPUTE_PACK_INSPECTION_STATUSES,
      ...NIR_REPORT_INSPECTION_STATUSES,
    ]) {
      expect(known).toContain(status);
    }
  });
});

describe("lists moved to the owner keep their members (RA-8422)", () => {
  const known = Object.values(InspectionStatus) as string[];

  it("names the active states exactly as isActiveInspectionStatus decides them", () => {
    expect([...ACTIVE_INSPECTION_STATUSES]).toEqual(
      known.filter((s) => isActiveInspectionStatus(s)),
    );
    expect([...ACTIVE_INSPECTION_STATUSES]).toEqual([
      "DRAFT",
      "SUBMITTED",
      "PROCESSING",
      "CLASSIFIED",
      "SCOPED",
      "ESTIMATED",
      "IN_BILLING",
    ]);
  });

  it("allows sign-off in ESTIMATED, COMPLETED and SUBMITTED only", () => {
    expect([...SIGN_OFF_INSPECTION_STATUSES]).toEqual([
      "ESTIMATED",
      "COMPLETED",
      "SUBMITTED",
    ]);
    for (const status of known) {
      expect(inspectionStatusAllowsSignOff(status)).toBe(
        ["ESTIMATED", "COMPLETED", "SUBMITTED"].includes(status),
      );
    }
    expect(inspectionStatusAllowsSignOff(null)).toBe(false);
  });

  it("treats SUBMITTED and every later state, REJECTED excepted, as submitted", () => {
    expect([...SUBMITTED_OR_LATER_INSPECTION_STATUSES].sort()).toEqual(
      known.filter((s) => s !== "DRAFT" && s !== "REJECTED").sort(),
    );
  });

  it("keeps the Guidewire export states unchanged, without IN_BILLING or CLOSED (owner decision pending)", () => {
    expect([...GUIDEWIRE_EXPORT_INSPECTION_STATUSES]).toEqual([
      "ESTIMATED",
      "COMPLETED",
      "SCOPED",
      "CLASSIFIED",
    ]);
    expect(inspectionStatusAllowsGuidewireExport("IN_BILLING")).toBe(false);
    expect(inspectionStatusAllowsGuidewireExport("CLOSED")).toBe(false);
    expect(inspectionStatusAllowsGuidewireExport("ESTIMATED")).toBe(true);
    expect(inspectionStatusAllowsGuidewireExport(undefined)).toBe(false);
  });

  it("keeps the pulse digest states unchanged, without IN_BILLING (owner decision pending)", () => {
    expect([...PULSE_DIGEST_INSPECTION_STATUSES]).toEqual([
      "DRAFT",
      "SUBMITTED",
      "PROCESSING",
      "CLASSIFIED",
      "SCOPED",
      "ESTIMATED",
    ]);
  });

  it("only names statuses the database can hold", () => {
    for (const list of [
      ACTIVE_INSPECTION_STATUSES,
      SIGN_OFF_INSPECTION_STATUSES,
      SUBMITTED_OR_LATER_INSPECTION_STATUSES,
      GUIDEWIRE_EXPORT_INSPECTION_STATUSES,
      PULSE_DIGEST_INSPECTION_STATUSES,
    ]) {
      for (const status of list) expect(known).toContain(status);
    }
  });
});
