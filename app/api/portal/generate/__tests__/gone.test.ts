/**
 * RA-7634 (RA-7616 A6) — the old "Share with client" link maker is retired.
 *
 * `POST /api/portal/generate` minted a stateless HMAC link. There is no row
 * behind it, so staff cannot revoke or rotate it: a link emailed to the wrong
 * person stays live until its 7-day expiry. It now answers 410 and mints
 * nothing. The Share button issues links through the revocable
 * `/api/inspections/[id]/client-portal-link` route instead.
 *
 * Links it already issued keep working read-only until they expire; that
 * fallback lives in `lib/portal/resolve-portal-inspection.ts`, not here.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/portal-token", () => ({
  generatePortalToken: vi.fn(() => "minted-hmac-token"),
  portalTokenExpiresAt: vi.fn(() => new Date("2026-10-01T00:00:00Z")),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn(), findUnique: vi.fn() },
    clientPortalAccount: {
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { generatePortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mGenerate = generatePortalToken as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  clientPortalAccount: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

const request = () =>
  new NextRequest("http://localhost/api/portal/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inspectionId: "insp_1" }),
  });

function expectNothingMinted() {
  expect(mGenerate).not.toHaveBeenCalled();
  expect(p.clientPortalAccount.create).not.toHaveBeenCalled();
  expect(p.clientPortalAccount.update).not.toHaveBeenCalled();
  expect(p.clientPortalAccount.upsert).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u_1" } });
  // The staff member owns the inspection, so the old route would have minted.
  p.inspection.findFirst.mockResolvedValue({ id: "insp_1" });
});

describe("POST /api/portal/generate (retired)", () => {
  it("returns 410 Gone and mints no link and no row", async () => {
    const res = await POST(request());

    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body).not.toHaveProperty("portalUrl");
    expect(JSON.stringify(body)).not.toContain("minted-hmac-token");
    expectNothingMinted();
  });

  it("still requires a signed-in staff member, and mints nothing without one", async () => {
    mSession.mockResolvedValueOnce(null);

    const res = await POST(request());

    expect(res.status).toBe(401);
    expectNothingMinted();
  });

  it("the Share with client button no longer calls it; it uses the revocable client-portal-link route", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/dashboard/inspections/[id]/page.tsx"),
      "utf8",
    );
    const handler =
      source.match(
        /const handleShareWithClient = async \(\) => \{[\s\S]*?\n {2}\};/,
      )?.[0] ?? "";

    expect(handler).not.toBe("");
    expect(source).not.toContain("/api/portal/generate");
    expect(handler).toContain(
      "`/api/inspections/${inspection.id}/client-portal-link`",
    );
  });
});
