// @vitest-environment jsdom
/**
 * RA-8330 (Ascora intake training, crease RC-A): Save Draft ran the make-safe
 * "ready to submit" check. An unfinished checklist threw before the draft
 * snapshot, so nothing else saved and the technician lost the draft.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  draftSaveFailureMessage,
  saveDraftParts,
  sidecarPart,
} from "@/lib/nir-draft-save";
import { DRAFT_SAVE_STATUS_EVENT, trackDraftSave } from "@/lib/offline/draft-save-status";

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
  const start = formSource.lastIndexOf("onClick={", label);
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

describe("sidecarPart (review round 1)", () => {
  it("does not count a part with unsaved data and no panel as saved", async () => {
    const result = await saveDraftParts([
      sidecarPart("claim assessment", { panel: () => null, hasPendingData: () => true }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.failures[0].label).toBe("claim assessment");
  });

  it("saves pending data directly when the panel is not on screen", async () => {
    const saved: string[] = [];
    const result = await saveDraftParts([
      sidecarPart("make-safe checklist", {
        panel: () => null,
        hasPendingData: () => true,
        saveDirect: async () => {
          saved.splice(saved.length, 0, "direct");
        },
      }),
    ]);
    expect(result.ok).toBe(true);
    expect(saved).toEqual(["direct"]);
  });

  it("reads the panel when the part runs, not when it is built", async () => {
    let panel: { persist: () => Promise<void>; isReady: () => boolean } | null = null;
    const saved: string[] = [];
    const part = sidecarPart("claim assessment", {
      panel: () => panel,
      hasPendingData: () => true,
    });
    panel = {
      isReady: () => true,
      persist: async () => {
        saved.splice(saved.length, 0, "panel");
      },
    };
    const result = await saveDraftParts([part]);
    expect(result.ok).toBe(true);
    expect(saved).toEqual(["panel"]);
  });

  it("skips a part with no panel and nothing to save", async () => {
    const result = await saveDraftParts([
      sidecarPart("claim assessment", { panel: () => null, hasPendingData: () => false }),
    ]);
    expect(result).toEqual({ ok: true, failures: [] });
  });
});

describe("Save Draft button (review round 1)", () => {
  it("builds the make-safe and claim parts with sidecarPart", () => {
    const handler = saveDraftHandler();
    expect(handler).toMatch(/sidecarPart\("make-safe checklist"/);
    expect(handler).toMatch(/sidecarPart\("claim assessment"/);
    expect(handler).not.toMatch(/makeSafeChecklistRef\.current\?\.persist\(\)/);
    expect(handler).not.toMatch(/run: persistClaimAssessment/);
  });

});

describe("Save Draft badge outcome has one owner (review round 2)", () => {
  it("the whole handler runs inside trackDraftSave", () => {
    const handler = saveDraftHandler();
    expect(handler).toMatch(/^onClick=\{\(\) => trackDraftSave\(async \(\) => \{/);
  });

  it("the handler never reports the badge itself and has no exit without a value", () => {
    const handler = saveDraftHandler();
    expect(handler).not.toContain("reportDraftSave(");
    expect(handler).not.toMatch(/\breturn\s*;/);
  });

  it("trackDraftSave reports a failed save for every exit except true", async () => {
    const seen: boolean[] = [];
    const listener = (e: Event) => {
      seen.splice(seen.length, 0, (e as CustomEvent<{ ok: boolean }>).detail.ok);
    };
    window.addEventListener(DRAFT_SAVE_STATUS_EVENT, listener);
    try {
      expect(await trackDraftSave(async () => {})).toBe(false);
      expect(await trackDraftSave(async () => false)).toBe(false);
      expect(
        await trackDraftSave(async () => {
          throw new Error("HTTP 500");
        }),
      ).toBe(false);
      expect(await trackDraftSave(async () => true)).toBe(true);
    } finally {
      window.removeEventListener(DRAFT_SAVE_STATUS_EVENT, listener);
    }
    expect(seen).toEqual([false, false, false, true]);
  });
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readSource = (rel: string) =>
  stripComments(readFileSync(join(repoRoot, rel), "utf8"));

describe("a panel still loading is never saved through (review round 3)", () => {
  it("saves pending data directly while the panel is still loading", async () => {
    const saved: string[] = [];
    const result = await saveDraftParts([
      sidecarPart("make-safe checklist", {
        panel: () => ({
          isReady: () => false,
          persist: async () => {
            saved.splice(saved.length, 0, "panel-defaults");
          },
        }),
        hasPendingData: () => true,
        saveDirect: async () => {
          saved.splice(saved.length, 0, "seed");
        },
      }),
    ]);
    expect(result.ok).toBe(true);
    expect(saved).toEqual(["seed"]);
  });

  it("names a loading part with data and no direct route as not saved", async () => {
    const result = await saveDraftParts([
      sidecarPart("claim assessment", {
        panel: () => ({ isReady: () => false, persist: async () => {} }),
        hasPendingData: () => true,
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.failures[0].label).toBe("claim assessment");
  });

  it("the make-safe panel refuses to save before its checklist has loaded", () => {
    const src = readSource("components/inspection/MakeSafeChecklist.tsx");
    expect(src).toMatch(/isReady: \(\) => hydratedRef\.current/);
    expect(src).toMatch(/persist: async \(\) => \{\s*if \(!hydratedRef\.current\)\s*\{\s*throw/);
    expect(src).not.toMatch(/persist: \(\) => persistMakeSafeChecklist\(/);
  });

  it("the claim panel keeps the Quick Fill seed when no record is saved yet, and refuses early saves", () => {
    const src = readSource("components/inspection/NIRClaimAssessmentPanel.tsx");
    expect(src).toContain("setFormData({ ...(assessmentSeedRef.current ?? {}) })");
    expect(src).not.toMatch(/\} else \{\s*setFormData\(\{\}\);\s*setGates/);
    expect(src).toMatch(/persist: async \(\) => \{\s*if \(!\(assessmentLoadedRef\.current && complianceLoadedRef\.current\)\)/);
  });
});
