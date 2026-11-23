/**
 * RA-8350: /api/storage/thumbnail must not redirect a signed-in user to an
 * outside site. Only allow-listed media hosts (owner:
 * lib/media/cloudinary-asset-url.ts) may be redirected to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { GET } from "../route";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;

const call = (path: string) =>
  GET(
    new NextRequest(
      "http://localhost/api/storage/thumbnail?path=" +
        encodeURIComponent(path),
    ),
  );

describe("GET /api/storage/thumbnail (RA-8350)", () => {
  beforeEach(() => {
    mockSession.mockResolvedValue({ user: { id: "u1" } });
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo-cloud");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "https://evil.example/login",
    "http://example.com/",
    "https://res.cloudinary.com.evil.example/x.jpg",
    "https://res.cloudinary.com@evil.example/x.jpg",
  ])("refuses outside host %s with 422 and no Location", async (path) => {
    const res = await call(path);
    expect(res.status).toBe(422);
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects an absolute Cloudinary URL, with the thumb transform", async () => {
    const res = await call(
      "https://res.cloudinary.com/demo-cloud/image/upload/v1/folder/pic.jpg",
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(new URL(loc).hostname).toBe("res.cloudinary.com");
    expect(loc).toContain("w_480");
  });

  it("still redirects a relative public ID to Cloudinary", async () => {
    const res = await call("inspection-photos/org/job/photo");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(new URL(loc).hostname).toBe("res.cloudinary.com");
    expect(loc).toContain("inspection-photos/org/job/photo");
  });

  it("refuses signed-out callers with 401", async () => {
    mockSession.mockResolvedValue(null);
    const res = await call("inspection-photos/org/job/photo");
    expect(res.status).toBe(401);
  });
});
