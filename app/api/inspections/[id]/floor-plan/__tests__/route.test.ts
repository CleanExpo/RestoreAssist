/**
 * RA-8603: the moisture-map floor-plan upload uses the RA-8234 strict policy
 * (one owner in lib/media/validate-image-upload.ts). Oversized bodies and
 * files are refused with 413 before anything reaches storage.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const uploadToCloudinary = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: {
      inspectionWhere: { id: "insp-1" },
      inspectionManyWhere: { id: "insp-1" },
    },
  })),
}));
vi.mock("@/lib/cloudinary", () => ({ uploadToCloudinary }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: vi.fn(async () => ({ id: "insp-1" })),
      update: vi.fn(async () => ({})),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));

import { getServerSession } from "next-auth";
import { STRICT_UPLOAD_POLICY } from "@/lib/media/validate-image-upload";
import { makePng } from "@/lib/media/__tests__/image-fixtures";
import { POST } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const params = { params: Promise.resolve({ id: "insp-1" }) };

function requestWith(bytes: Uint8Array, type: string, name = "plan.png") {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return new NextRequest("http://localhost/api/inspections/insp-1/floor-plan", {
    method: "POST",
    body: form,
  });
}

async function messageOf(res: Response): Promise<string> {
  const body = await res.json();
  return body?.error?.message ?? body?.message ?? body?.error;
}

describe("POST /api/inspections/[id]/floor-plan (RA-8603)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockResolvedValue({ user: { id: "user-1" } });
    uploadToCloudinary.mockResolvedValue({ url: "https://cdn.test/plan.png" });
  });

  it("stores a valid PNG floor plan", async () => {
    const res = await POST(
      requestWith(new Uint8Array(makePng(40, 30)), "image/png"),
      params,
    );
    expect(res.status).toBe(200);
    expect(uploadToCloudinary).toHaveBeenCalledTimes(1);
  });

  it("refuses a file over the shared size limit with 413 before storage", async () => {
    // A real PNG header padded past the 10 MB strict limit.
    const png = makePng(40, 30);
    const big = new Uint8Array(STRICT_UPLOAD_POLICY.maxBytes + 1024);
    big.set(png, 0);
    const res = await POST(requestWith(big, "image/png"), params);
    expect(res.status).toBe(413);
    expect(await messageOf(res)).toMatch(/10 MB/);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("refuses a request body over the byte cap with 413 before storage", async () => {
    const huge = new Uint8Array(13 * 1024 * 1024);
    const res = await POST(requestWith(huge, "image/png"), params);
    expect(res.status).toBe(413);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("refuses a pixel bomb by its header dimensions", async () => {
    const res = await POST(
      requestWith(new Uint8Array(makePng(10_001, 10)), "image/png"),
      params,
    );
    expect(res.status).toBe(400);
    expect(await messageOf(res)).toMatch(/dimensions/i);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("refuses a text file renamed to .png with a readable message", async () => {
    const res = await POST(
      requestWith(new TextEncoder().encode("not an image"), "image/png"),
      params,
    );
    expect(res.status).toBe(400);
    expect(await messageOf(res)).toMatch(/PNG, JPEG or WebP/);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("no longer accepts GIF (strict policy: PNG, JPEG, WebP)", async () => {
    const res = await POST(
      requestWith(
        new TextEncoder().encode("GIF89a\x01\x00\x01\x00\x00\x00\x00;"),
        "image/gif",
        "plan.gif",
      ),
      params,
    );
    expect(res.status).toBe(400);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });
});
