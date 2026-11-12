/**
 * RA-8330 (Ascora intake training, crease RC-A): Save Draft ran the make-safe
 * "ready to submit" check. An unfinished checklist threw before the draft
 * snapshot, so nothing else saved and the technician lost the draft.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { draftSaveFailureMessage, saveDraftParts } from "@/lib/nir-draft-save";

const formSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../NIRTechnicianInputForm.tsx"),
  "utf8",
);

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function saveDraftHandler(): string {
  const label = formSource.indexOf('"Save Draft"}');
  expect(label).toBeGreaterThan(-1);
  const start = formSource.lastIndexOf("onClick={async () => {", label);
  expect(start).toBeGreaterThan(-1);
  return stripComments(formSource.slice(start, label));
}

describe("saveDraftParts", () => {
  it("runs every part even when an earlier part fails", async () => {
    const ran: string[] = [];
    const result = await saveDraftParts([
      { label: "make-safe checklist", run: async () => { ran.push("a"); throw new Error("not ready"); } },
      { label: "claim assessment", run: async () => { ran.push("b"); } },
      { label: "inspection details", run: async () => { ran.push("c"); } },
    ]);
    expect(ran).toEqual(["a", "b", "c"]);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([{ label: "make-safe checklist", message: "not ready" }]);
  });

  it("reports success only when every part saved", async () => {
    const result = await saveDraftParts([
      { label: "a", run: async () => {} },
      { label: "b", run: async () => {} },
    ]);
    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("names each failed part in the message", () => {
    const msg = draftSaveFailureMessage([
      { label: "claim assessment", message: "HTTP 500" },
      { label: "floor plan", message: "HTTP 500" },
    ]);
    expect(msg).toContain("claim assessment, floor plan");
  });
});

describe("Save Draft button", () => {
  it("does not run the submit readiness check", () => {
    const handler = saveDraftHandler();
    expect(handler).not.toContain("persistInspectionSidecars(");
    expect(handler).not.toContain("readiness(");
  });

  it("saves the draft snapshot through saveDraftParts", () => {
    const handler = saveDraftHandler();
    expect(handler).toContain("saveDraftParts(");
    expect(handler).toMatch(/saveDraftSnapshot\(currentInspectionId\)/);
  });

  it("keeps the readiness check on the submit path", () => {
    const helper = stripComments(
      formSource.slice(
        formSource.indexOf("const persistMakeSafeChecklist"),
        formSource.indexOf("const persistClaimAssessment"),
      ),
    );
    expect(helper).toContain("readiness()");
  });
});
