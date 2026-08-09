/**
 * P0-1 read-path re-signing — parser coverage.
 *
 * The parser is the load-bearing pure function behind serving private-bucket
 * media at read time. It must extract bucket + path from both public and signed
 * Supabase URLs and refuse everything else so legacy/passthrough hosts are left
 * untouched.
 */

import { afterAll, beforeEach, describe, it, expect, vi } from "vitest";

const { createSignedUrl, storageFrom } = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: { from: storageFrom },
  }),
}));

import {
  parseSupabaseStorageUrl,
  signStoredMediaUrl,
} from "../sign-stored-url";

const HOST = "https://abc.supabase.co";
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = HOST;
  createSignedUrl.mockReset();
  storageFrom.mockReset().mockReturnValue({ createSignedUrl });
});

afterAll(() => {
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
});

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
      parseSupabaseStorageUrl(
        "https://res.cloudinary.com/x/image/upload/a.jpg",
      ),
    ).toBeNull();
  });

  it("returns null for empty / bucket-only / malformed input", () => {
    expect(parseSupabaseStorageUrl("")).toBeNull();
    expect(
      parseSupabaseStorageUrl(`${HOST}/storage/v1/object/public/onlybucket`),
    ).toBeNull();
    expect(parseSupabaseStorageUrl("not a url")).toBeNull();
  });

  it("returns null instead of throwing for malformed percent encoding", () => {
    expect(
      parseSupabaseStorageUrl(
        `${HOST}/storage/v1/object/sign/sketch-media/inspections/i1/%zz.png`,
      ),
    ).toBeNull();
  });

  it.each([
    "inspections/i1/%2e%2e/i2/floor.png",
    "inspections/i1/%252e%252e/i2/floor.png",
    "inspections/i1/%5c..%5cfloor.png",
  ])("rejects unsafe encoded storage paths: %s", (path) => {
    expect(
      parseSupabaseStorageUrl(
        `${HOST}/storage/v1/object/sign/sketch-media/${path}`,
      ),
    ).toBeNull();
  });
});

describe("signStoredMediaUrl", () => {
  const storedPrivateUrl = `${HOST}/storage/v1/object/sign/sketch-media/inspections/i1/exports/floor-0.png?token=expired`;

  it("re-signs a recognised private-bucket URL", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/fresh" },
      error: null,
    });

    await expect(
      signStoredMediaUrl(storedPrivateUrl, {
        expectedBucket: "sketch-media",
        requiredPathPrefix: "inspections/i1/",
      }),
    ).resolves.toBe("https://signed.example/fresh");
    expect(storageFrom).toHaveBeenCalledWith("sketch-media");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "inspections/i1/exports/floor-0.png",
      3600,
    );
  });

  it.each([
    {
      label: "the storage API returns an error",
      result: { data: null, error: { message: "denied" } },
    },
    {
      label: "the storage API omits the signed URL",
      result: { data: {}, error: null },
    },
  ])("fails closed when $label", async ({ result }) => {
    createSignedUrl.mockResolvedValue(result);

    await expect(signStoredMediaUrl(storedPrivateUrl)).resolves.toBeNull();
  });

  it("fails closed when signing throws", async () => {
    createSignedUrl.mockRejectedValue(new Error("storage unavailable"));

    await expect(signStoredMediaUrl(storedPrivateUrl)).resolves.toBeNull();
  });

  it("fails closed for a storage URL on a hostile lookalike hostname", async () => {
    const hostileUrl = storedPrivateUrl.replace(
      HOST,
      "https://abc.supabase.co.evil.example",
    );

    await expect(signStoredMediaUrl(hostileUrl)).resolves.toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("fails closed for a storage-looking URL when Supabase origin config is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    await expect(signStoredMediaUrl(storedPrivateUrl)).resolves.toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("fails closed without throwing for malformed path encoding", async () => {
    const malformedUrl = `${HOST}/storage/v1/object/sign/sketch-media/inspections/i1/%zz.png`;

    await expect(signStoredMediaUrl(malformedUrl)).resolves.toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("fails closed when the bucket does not match the caller constraint", async () => {
    const wrongBucketUrl = storedPrivateUrl.replace(
      "/sketch-media/",
      "/evidence-optimised/",
    );

    await expect(
      signStoredMediaUrl(wrongBucketUrl, { expectedBucket: "sketch-media" }),
    ).resolves.toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("fails closed when the object belongs to another inspection", async () => {
    const otherInspectionUrl = storedPrivateUrl.replace(
      "/inspections/i1/",
      "/inspections/i2/",
    );

    await expect(
      signStoredMediaUrl(otherInspectionUrl, {
        expectedBucket: "sketch-media",
        requiredPathPrefix: "inspections/i1/",
      }),
    ).resolves.toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it.each([
    "inspections/i1/%2e%2e/i2/floor.png",
    "inspections/i1/%252e%252e/i2/floor.png",
  ])("fails closed for traversal path %s", async (path) => {
    const traversalUrl = `${HOST}/storage/v1/object/sign/sketch-media/${path}?token=expired`;

    await expect(
      signStoredMediaUrl(traversalUrl, {
        expectedBucket: "sketch-media",
        requiredPathPrefix: "inspections/i1/",
      }),
    ).resolves.toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("preserves external URLs without contacting Supabase", async () => {
    const externalUrl = "https://res.cloudinary.com/x/image/upload/a.jpg";

    await expect(signStoredMediaUrl(externalUrl)).resolves.toBe(externalUrl);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("preserves external URLs when Supabase origin config is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const externalUrl = "https://res.cloudinary.com/x/image/upload/a.jpg";

    await expect(signStoredMediaUrl(externalUrl)).resolves.toBe(externalUrl);
    expect(storageFrom).not.toHaveBeenCalled();
  });
});
