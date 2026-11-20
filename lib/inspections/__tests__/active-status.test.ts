import { describe, expect, it } from "vitest";
import { InspectionStatus } from "@prisma/client";
import {
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
