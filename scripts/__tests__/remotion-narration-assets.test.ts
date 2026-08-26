import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the defect that shipped silent tutorial videos.
 *
 * Remotion resolves `staticFile()` against the bundle's public directory, and
 * `bundle()` defaults that to `public/` beside the entry point. This project
 * keeps its narration MP3s in `tools/remotion/assets/` and has no `public/`
 * folder at all, so every `<Audio src={staticFile('narration/…')} />` resolved
 * to nothing.
 *
 * Remotion does not fail on a missing audio source — it renders the video
 * without it. Nine rendered tutorials in public/videos/tutorials/ carry a
 * video track and no audio track at all, and nothing caught it until someone
 * played one. These tests are the check that was missing.
 */

const REMOTION_ROOT = join(process.cwd(), "tools", "remotion");
const PUBLIC_DIR = join(REMOTION_ROOT, "assets");
const COMPOSITIONS_DIR = join(REMOTION_ROOT, "compositions");
const RENDER_SCRIPT = join(REMOTION_ROOT, "render-all.ts");

const STATIC_FILE_RE = /staticFile\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Asset references that do not resolve today, pinned so the gap is visible
 * rather than silent. This is a ratchet, not an exemption: adding a new broken
 * reference fails this test, and producing one of these assets also fails it
 * until the entry is removed.
 *
 * `narration/onboarding-welcome.mp3` is the one that bites a new customer
 * first — it is the Welcome step at the top of /setup. Its narration script
 * exists (public/videos/captions/onboarding-welcome.vtt) but was never
 * rendered to audio, so that video is silent even once publicDir is correct.
 *
 * The `screenshots/ra-ui/*.png` entries are product screenshots that were
 * never captured; those compositions render with the image missing.
 */
const KNOWN_MISSING_ASSETS = [
  "industry-promo/music.mp3",
  "industry-promo/voiceover.mp3",
  "logo.png",
  "narration/onboarding-welcome.mp3",
  "screenshots/ra-ui/analytics-overview.png",
  "screenshots/ra-ui/client-portal.png",
  "screenshots/ra-ui/compliance-checklists.png",
  "screenshots/ra-ui/evidence-capture.png",
  "screenshots/ra-ui/inspection-new.png",
  "screenshots/ra-ui/inspections-list.png",
  "screenshots/ra-ui/integration-connect.png",
  "screenshots/ra-ui/invoice-generator.png",
  "screenshots/ra-ui/moisture-mapping.png",
  "screenshots/ra-ui/pricing-page.png",
  "screenshots/ra-ui/report-builder.png",
  "screenshots/ra-ui/settings-profile.png",
  "screenshots/ra-ui/team-management.png",
] as const;

/** Source with comments removed, for assertions about code rather than prose. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function staticFileRefs(): Array<{ file: string; asset: string }> {
  const refs: Array<{ file: string; asset: string }> = [];
  for (const file of readdirSync(COMPOSITIONS_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const source = readFileSync(join(COMPOSITIONS_DIR, file), "utf8");
    for (const [, asset] of source.matchAll(STATIC_FILE_RE)) {
      refs.push({ file, asset });
    }
  }
  return refs;
}

function unresolvedAssets(): string[] {
  const missing = staticFileRefs()
    .filter(({ asset }) => !existsSync(join(PUBLIC_DIR, asset)))
    .map(({ asset }) => asset);
  return [...new Set(missing)].sort();
}

describe("Remotion narration assets", () => {
  it("finds compositions that reference narration at all", () => {
    // Guards the test itself: a glob that matched nothing would make every
    // assertion below vacuously true.
    const refs = staticFileRefs();
    expect(refs.length).toBeGreaterThan(10);
    expect(refs.filter((r) => r.asset.startsWith("narration/")).length)
      .toBeGreaterThan(10);
  });

  // The bug was never a missing file — the 63 narration MP3s were always
  // there. It was that the bundler was never told where to look, so assert
  // the wiring directly rather than inferring it from a render.
  it("passes publicDir to bundle(), which otherwise defaults to public/", () => {
    const source = readFileSync(RENDER_SCRIPT, "utf8");
    expect(source).toMatch(/publicDir:\s*PUBLIC_DIR/);
    expect(source).toMatch(/const PUBLIC_DIR = path\.join\(HERE, 'assets'\)/);
  });

  it("resolves its entry point relative to the script, not the cwd", () => {
    // `path.join(process.cwd(), 'remotion', 'index.tsx')` only resolved when
    // run from tools/; from the repo root, where npm run render:tutorials runs
    // it, that path does not exist and the render could not start.
    // Strip comments first — the fixed script documents the old pattern in
    // prose, and matching that would fail for the wrong reason.
    expect(codeOf(RENDER_SCRIPT)).not.toMatch(/path\.join\(\s*process\.cwd\(\)/);
    expect(existsSync(join(REMOTION_ROOT, "index.tsx"))).toBe(true);
  });

  it("has no public/ directory that would silently win over assets/", () => {
    // If tools/remotion/public/ is ever created, staticFile() resolves there
    // instead and every narration reference goes quiet again.
    expect(existsSync(join(REMOTION_ROOT, "public"))).toBe(false);
  });

  it("keeps every narration MP3 the compositions ask for", () => {
    // Narration is the audio track. A missing entry here is a silent video,
    // which is the whole point of this file.
    const missingNarration = unresolvedAssets().filter((a) =>
      a.startsWith("narration/"),
    );
    expect(missingNarration).toEqual(["narration/onboarding-welcome.mp3"]);
  });

  it("pins the unresolved asset list so the gap cannot grow unnoticed", () => {
    expect(unresolvedAssets()).toEqual([...KNOWN_MISSING_ASSETS]);
  });

  it("fails the render preflight rather than producing a silent video", () => {
    const source = readFileSync(RENDER_SCRIPT, "utf8");
    expect(source).toMatch(/assertNarrationPresent\(\)/);
    expect(source).toMatch(/process\.exit\(1\)/);
  });
});
