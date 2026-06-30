/**
 * Stabilisation P0 — submit route must NOT auto-promote inspection
 * status to "COMPLETED". COMPLETED is the terminal close state owned
 * exclusively by the user-driven CloseJobPrompt flow (SP-A close gate,
 * S500:2021 §5.3 Editability invariant). The AI submit pipeline stops
 * at "ESTIMATED" — anything beyond is a regression of the close gate.
 *
 * Source-text guard: cheaper and more durable than mocking the entire
 * processInspectionComplete dependency tree (15+ lib imports). If a
 * future change re-introduces the auto-COMPLETED write, this test
 * fails the build before the regression ships.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_PATH = join(
  process.cwd(),
  "app/api/inspections/[id]/submit/route.ts",
);

describe("submit route — close-gate invariant", () => {
  const source = readFileSync(ROUTE_PATH, "utf8");

  it("does not write status: COMPLETED anywhere in the route", () => {
    // Tolerate whitespace + single/double quotes around COMPLETED.
    const autoCompletePattern = /status\s*:\s*['"]COMPLETED['"]/;
    expect(source).not.toMatch(autoCompletePattern);
  });

  it("still writes status: ESTIMATED as the terminal AI-pipeline state", () => {
    expect(source).toMatch(/status\s*:\s*['"]ESTIMATED['"]/);
  });
});
