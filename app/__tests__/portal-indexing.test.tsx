import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { metadata } from "../portal/layout";

describe("portal indexing controls", () => {
  it("marks every portal page noindex and nofollow in metadata", () => {
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
      noimageindex: true,
    });
  });

  it("adds a crawler-blocking response header to portal routes", () => {
    const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
    expect(config).toMatch(
      /source: "\/portal\(\.\*\)"[\s\S]*?key: "X-Robots-Tag"[\s\S]*?value: "noindex, nofollow, noarchive, noimageindex"/,
    );
  });
});
