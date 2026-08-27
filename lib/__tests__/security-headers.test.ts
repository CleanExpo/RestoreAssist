import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config.mjs";

function directiveSources(csp: string, directiveName: string): string[] {
  const directive = csp
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${directiveName} `));

  if (!directive) return [];
  return directive.split(/\s+/).slice(1);
}

async function contentSecurityPolicy(): Promise<string> {
  const headerRules = await nextConfig.headers();
  const globalRule = headerRules.find((rule) => rule.source === "/(.*)");
  const csp = globalRule?.headers.find(
    (header) => header.key === "Content-Security-Policy",
  );

  if (!csp) throw new Error("Global Content-Security-Policy header is missing");
  return csp.value;
}

describe("global security headers", () => {
  it("allows the pinned ElevenLabs widget loader without broadening its origin", async () => {
    const csp = await contentSecurityPolicy();
    const scriptSources = directiveSources(csp, "script-src");

    expect(scriptSources).toContain(
      "https://unpkg.com/@elevenlabs/convai-widget-embed@0.14.10",
    );
    expect(scriptSources).not.toContain("https://unpkg.com");
    expect(scriptSources).not.toContain("https://*.unpkg.com");
  });

  it("allows privacy-friendly YouTube embeds and refuses the cookie host", async () => {
    const csp = await contentSecurityPolicy();
    const frames = directiveSources(csp, "frame-src");
    const images = directiveSources(csp, "img-src");

    expect(frames).toContain("https://www.youtube-nocookie.com");
    expect(frames).not.toContain("https://www.youtube.com");
    expect(frames).not.toContain("https://youtube.com");
    expect(frames).not.toContain("https://*.youtube.com");
    expect(images).toContain("https://i.ytimg.com");
  });
});
