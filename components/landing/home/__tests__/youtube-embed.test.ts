import { describe, expect, it } from "vitest";
import { HOME } from "../homeContent";
import {
  isSafeYoutubeId,
  youtubeNocookieEmbedSrc,
  youtubeThumbnailSrc,
} from "../youtube-embed";

describe("youtube-embed hardening", () => {
  it("accepts the configured landing overview id", () => {
    expect(isSafeYoutubeId(HOME.overview.youtubeId)).toBe(true);
    expect(youtubeNocookieEmbedSrc(HOME.overview.youtubeId)).toBe(
      `https://www.youtube-nocookie.com/embed/${HOME.overview.youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    );
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
    expect(embed).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/LTvdsd9jSBY\?/);
    expect(thumb).toBe("https://i.ytimg.com/vi/LTvdsd9jSBY/maxresdefault.jpg");
  });
});
