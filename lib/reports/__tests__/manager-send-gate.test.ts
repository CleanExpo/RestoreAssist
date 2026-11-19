import { describe, it, expect } from "vitest";
import { blocksReportSendForTechnicianRole } from "../manager-send-gate";

describe("blocksReportSendForTechnicianRole", () => {
  it("blocks field technicians (USER)", () => {
    expect(blocksReportSendForTechnicianRole("USER")).toBe(true);
  });

  it("allows managers and admins", () => {
    expect(blocksReportSendForTechnicianRole("MANAGER")).toBe(false);
    expect(blocksReportSendForTechnicianRole("ADMIN")).toBe(false);
  });
});