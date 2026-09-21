import { describe, expect, it } from "vitest";
import { CLIENT_PORTAL_VIDEOS } from "../client-videos";
import {
  CLIENT_HELP_ARTICLES,
  CLIENT_HELP_TOPICS,
  getClientHelpArticle,
  videosForArticle,
} from "../client-help";
import { findForbiddenClientPortalHrefs } from "../recovery-paths";

describe("client-specific help corpus", () => {
  it("covers reports, approvals, invoices, support, and access", () => {
    const topics = new Set(CLIENT_HELP_ARTICLES.flatMap((article) => article.topics));
    for (const topic of CLIENT_HELP_TOPICS) {
      expect(topics.has(topic), `missing topic ${topic}`).toBe(true);
    }
  });

  it("does not paste contractor help (no workshop, Xero, or dashboard language)", () => {
    const blob = CLIENT_HELP_ARTICLES.map(
      (article) =>
        `${article.title} ${article.summary} ${article.sections.map((s) => s.body).join(" ")}`,
    ).join("\n");
    expect(blob).not.toMatch(/Xero|QuickBooks|ServiceM8|tradie|How To dropdown/i);
    expect(blob).not.toMatch(/\/dashboard\/help|contractor dashboard workshop/i);
    expect(findForbiddenClientPortalHrefs(blob)).toEqual([]);
  });

  it("related videos resolve to hosted Cloudinary mp4s", () => {
    for (const article of CLIENT_HELP_ARTICLES) {
      for (const video of videosForArticle(article)) {
        expect(CLIENT_PORTAL_VIDEOS.some((item) => item.id === video.id)).toBe(
          true,
        );
        expect(video.url).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\.mp4$/);
      }
    }
  });

  it("loads each published slug", () => {
    for (const article of CLIENT_HELP_ARTICLES) {
      expect(getClientHelpArticle(article.slug)?.slug).toBe(article.slug);
    }
    expect(getClientHelpArticle("not-a-real-slug")).toBeUndefined();
  });
});
