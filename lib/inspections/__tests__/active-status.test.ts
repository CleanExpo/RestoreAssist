import { describe, expect, it } from "vitest";
import { InspectionStatus } from "@prisma/client";
import {
  INACTIVE_INSPECTION_STATUSES,
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
