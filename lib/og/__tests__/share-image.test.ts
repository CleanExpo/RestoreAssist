/**
 * RA-8473: every public page shares the one link-preview picture.
 *
 * A page-level `openGraph` replaces the root object wholesale, so 13 marketing
 * layouts had each restated `/logo.png` as their share image and links to
 * them unfurled as a bare logo. The share image now has one owner,
 * OG_SHARE_IMAGE in lib/og/constants.ts; this guard fails if any page
 * metadata goes back to a hand-typed logo URL.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OG_SHARE_IMAGE, OG_SHARE_PATH, ogSize } from "@/lib/og/constants";

const APP = path.resolve(__dirname, "../../../app");
const SKIP = new Set(["node_modules", "__tests__", "api"]);

function metadataFiles(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) metadataFiles(p, out);
    else if (/^(page|layout)\.tsx$/.test(ent.name)) out.push(p);
  }
  return out;
}

describe("link-preview image", () => {
  it("points at the 1200x630 static share picture", () => {
    expect(OG_SHARE_PATH).toMatch(/^\/og\/restoreassist-share\.jpg\?v=\d{8}$/);
    expect(OG_SHARE_IMAGE).toMatchObject({
      url: OG_SHARE_PATH,
      width: ogSize.width,
      height: ogSize.height,
      type: "image/jpeg",
    });
    const file = path.resolve(
      __dirname,
      "../../../public",
      OG_SHARE_PATH.split("?")[0].slice(1),
    );
    expect(fs.existsSync(file)).toBe(true);
  });

  it("no page or layout metadata uses the logo as its share image", () => {
    const offenders = metadataFiles(APP).filter((f) =>
      /url:\s*["'`]\/logo\.png["'`]/.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => path.relative(APP, f))).toEqual([]);
  });
});
