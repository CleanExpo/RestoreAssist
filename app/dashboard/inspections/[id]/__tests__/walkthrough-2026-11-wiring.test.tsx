import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Field walkthrough 2026-11-09. Both pages are too large to render in unit
// tests (see ra7713-wiring.test.tsx), so these guard the wiring.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const jobPage = read("app/dashboard/inspections/[id]/page.tsx");
const capturePage = read("app/dashboard/inspections/[id]/capture/page.tsx");

describe("scroll position survives a refetch", () => {
  it("job page shows the full-page spinner only before the job first loads", () => {
    // A bare `if (loading)` unmounts the page on every save-triggered
    // refetch, which throws the technician back to the top.
    expect(jobPage).not.toMatch(/if \(loading\) \{\s*return/);
    expect(jobPage).toMatch(
      /if \(loading && \(!inspection \|\| inspection\.id !== id\)\) \{\s*return/,
    );
  });

  it("capture page shows the full-page spinner only before the workflow first loads", () => {
    expect(capturePage).not.toMatch(/if \(loading\) \{\s*return/);
    expect(capturePage).toMatch(/if \(loading && !workflow\) \{\s*return/);
  });
});

describe("video walkthrough capture", () => {
  it("routes video evidence to a video-only picker, not the stills camera", () => {
    expect(capturePage).toMatch(
      /const wantsVideo = isVideoEvidenceClass\(evidenceClass\)/,
    );
    expect(capturePage).toMatch(/if \(isNative && !wantsVideo\) \{\s*capture = await captureEvidencePhoto\(\)/);
    expect(capturePage).toMatch(/wantsVideo \? \{ accept: VIDEO_EVIDENCE_ACCEPT \} : \{\}/);
  });
});
