/**
 * P0-1 read-path re-signing — parser coverage.
 *
 * The parser is the load-bearing pure function behind serving private-bucket
 * media at read time. It must extract bucket + path from both public and signed
 * Supabase URLs and refuse everything else so legacy/passthrough hosts are left
 * untouched.
 */

import { describe, it, expect } from "vitest";
import { parseSupabaseStorageUrl } from "../sign-stored-url";

const HOST = "https://abc.supabase.co";

describe("parseSupabaseStorageUrl", () => {
  it("parses a public object URL", () => {
    expect(
      parseSupabaseStorageUrl(
        `${HOST}/storage/v1/object/public/evidence-optimised/org1/insp1/photo.jpg`,
      ),
    ).toEqual({ bucket: "evidence-optimised", path: "org1/insp1/photo.jpg" });
  });

  it("parses a signed object URL, dropping the token query", () => {
    expect(
      parseSupabaseStorageUrl(
        `${HOST}/storage/v1/object/sign/sketch-media/org1/sketch.png?token=eyJhbGc`,
      ),
    ).toEqual({ bucket: "sketch-media", path: "org1/sketch.png" });
  });

  it("url-decodes the object path", () => {
    expect(
      parseSupabaseStorageUrl(
        `${HOST}/storage/v1/object/public/evidence-optimised/org1/a%20b/c.jpg`,
      ),
    ).toEqual({ bucket: "evidence-optimised", path: "org1/a b/c.jpg" });
  });

  it("returns null for a non-Supabase URL (legacy Cloudinary)", () => {
    expect(
      parseSupabaseStorageUrl("https://res.cloudinary.com/x/image/upload/a.jpg"),
    ).toBeNull();
  });

  it("returns null for empty / bucket-only / malformed input", () => {
    expect(parseSupabaseStorageUrl("")).toBeNull();
    expect(
      parseSupabaseStorageUrl(`${HOST}/storage/v1/object/public/onlybucket`),
    ).toBeNull();
    expect(parseSupabaseStorageUrl("not a url")).toBeNull();
  });
});
