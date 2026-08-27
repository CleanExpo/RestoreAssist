import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOME } from "../homeContent";
import {
  isSafeYoutubeId,
  resolveEmbedOrigin,
  youtubeNocookieEmbedSrc,
  youtubeThumbnailSrc,
} from "../youtube-embed";

const landingRoot = join(__dirname, "..");
const readLanding = (name: string) =>
  readFileSync(join(landingRoot, name), "utf8");

describe("youtube-embed hardening", () => {
  it("accepts the configured landing overview id", () => {
    expect(isSafeYoutubeId(HOME.overview.youtubeId)).toBe(true);
    const embed = youtubeNocookieEmbedSrc(HOME.overview.youtubeId);
    expect(embed).toMatch(
      new RegExp(
        `^https://www\\.youtube-nocookie\\.com/embed/${HOME.overview.youtubeId}\\?`,
      ),
    );
    expect(embed).toContain("enablejsapi=0");
    expect(embed).toContain("origin=");
  });

  it.each([
    "",
    "short",
    "LTvdsd9jSBYX",
    "LTvdsd9jSB",
    "../LTvdsd9jSB",
    "LTvdsd9jSBY/evil",
    "javascript:alert",
    "https://evil",
    "LTvdsd9jSB ",
    "LTvdsd9jSB\n",
  ])("rejects unsafe id %j", (id) => {
    expect(isSafeYoutubeId(id)).toBe(false);
    expect(youtubeNocookieEmbedSrc(id)).toBeNull();
    expect(youtubeThumbnailSrc(id, "hqdefault")).toBeNull();
  });

  it("never emits a host other than youtube-nocookie or i.ytimg", () => {
    const embed = youtubeNocookieEmbedSrc("LTvdsd9jSBY");
    const thumb = youtubeThumbnailSrc("LTvdsd9jSBY", "maxresdefault");
    expect(embed).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/LTvdsd9jSBY\?/,
    );
    expect(thumb).toBe("https://i.ytimg.com/vi/LTvdsd9jSBY/maxresdefault.jpg");
    expect(embed).not.toContain("youtube.com/embed");
  });

  it.each([
    "javascript:alert(1)",
    "https://evil.example",
    "https://restoreassist.app.evil.com",
    "not-a-url",
    "ftp://restoreassist.app",
  ])("drops untrusted embed origin %j", (raw) => {
    expect(resolveEmbedOrigin(raw)).toBe("https://restoreassist.app");
    const embed = youtubeNocookieEmbedSrc("LTvdsd9jSBY", raw);
    expect(embed).toContain("origin=https%3A%2F%2Frestoreassist.app");
    expect(embed).not.toContain("evil");
    expect(embed).not.toContain("javascript");
  });

  it("keeps localhost and the production origin", () => {
    expect(resolveEmbedOrigin("http://localhost:3000/dashboard")).toBe(
      "http://localhost:3000",
    );
    expect(resolveEmbedOrigin("https://restoreassist.app/")).toBe(
      "https://restoreassist.app",
    );
  });

  it("landing sources never embed the cookie YouTube host", () => {
    for (const file of [
      "youtube-embed.ts",
      "LandingOverviewVideo.tsx",
      "homeContent.ts",
    ]) {
      const src = readLanding(file);
      expect(src, file).not.toMatch(/https:\/\/(www\.)?youtube\.com\/embed/);
    }
  });
});
