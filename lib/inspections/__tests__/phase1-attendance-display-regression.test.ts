/**
 * Phase 1 (Indooroopilly) — attendance must not be inferred from createdAt in UI.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("Phase 1 attendance display regression", () => {
  it("job list uses inspectionDate, not createdAt, for the calendar row", () => {
    const src = read("app/dashboard/inspections/page.tsx");
    expect(src).toMatch(/formatAttendanceDateEnAu\(insp\.inspectionDate\)/);
    expect(src).toMatch(/ATTENDANCE_NOT_RECORDED_LABEL/);
    expect(src).not.toMatch(
      /insp\.createdAt\)\.toLocaleDateString\("en-AU"/,
    );
  });

  it("job detail header uses inspectionDate, not createdAt", () => {
    const src = read("app/dashboard/inspections/[id]/page.tsx");
    expect(src).toMatch(/formatAttendanceDateEnAu\(inspection\.inspectionDate\)/);
    expect(src).not.toMatch(
      /inspection\.createdAt\)\.toLocaleDateString\("en-AU"/,
    );
  });

  it("client portal job shell uses recorded attendance only", () => {
    const src = read("app/portal/[token]/page.tsx");
    expect(src).toMatch(/formatAttendanceDateEnAuLong\(inspection\.inspectionDate\)/);
    expect(src).not.toMatch(
      /inspection\.createdAt\)\.toLocaleDateString\("en-AU"/,
    );
  });

  it("field dashboard links offline help when there is no signal", () => {
    const src = read("app/dashboard/field/page.tsx");
    expect(src).toMatch(/href="\/offline"/);
    expect(src).toMatch(/How offline sync works/);
  });
});
