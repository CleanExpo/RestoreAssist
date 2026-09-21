/**
 * RA-7451 — bulk ZIP self-fetch must not target a loopback origin when
 * NEXT_PUBLIC_APP_URL is unset. getAppUrl() is the SSOT and falls back
 * to the production origin.
 *
 * Do not mock @/lib/app-url. The subject is the real fallback the real
 * helper returns when the env var is absent; mocking the helper would
 * assert the mock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/bulk-operations", () => ({
  rateLimit: vi.fn(() => ({ allowed: true })),
  validateReportIds: vi.fn(async (ids: string[]) => ids),
  validateBatchSize: vi.fn(() => ({ valid: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/zip-archive", () => ({
  createZipArchive: vi.fn(async () => Buffer.from("PK")),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, { status }: { status: number }) =>
    new Response(null, { status }),
  fromException: () => new Response(null, { status: 500 }),
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const fetchMock = vi.fn();

function makeRequest(ids: string[]) {
  return new NextRequest("http://example.test/api/reports/bulk-export-zip", {
    method: "POST",
    body: JSON.stringify({ ids, pdfType: "basic" }),
  });
}

function firstFetchUrl(): string {
  expect(fetchMock).toHaveBeenCalled();
  return String(fetchMock.mock.calls[0]?.[0]);
}

describe("POST /api/reports/bulk-export-zip base URL (RA-7451)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1" },
    } as never);
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      { id: "report-1", reportNumber: "R-1", clientName: "Acme" },
    ] as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
  });

  it("reaches fetch so URL assertions are not vacuous", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const res = await POST(makeRequest(["report-1"]));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("self-fetches the production origin when NEXT_PUBLIC_APP_URL is unset, never a loopback host", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const res = await POST(makeRequest(["report-1"]));
    expect(res.status).toBe(200);

    const calledUrl = firstFetchUrl();
    expect(calledUrl).toBe(
      "https://restoreassist.app/api/reports/report-1/download?type=summary",
    );
    expect(calledUrl).not.toContain("localhost");
    expect(calledUrl).not.toMatch(/127\.0\.0\.1/);
  });

  it("strips a trailing slash on NEXT_PUBLIC_APP_URL so the path is not doubled", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://restoreassist.app/";

    const res = await POST(makeRequest(["report-1"]));
    expect(res.status).toBe(200);

    const calledUrl = firstFetchUrl();
    expect(calledUrl).toBe(
      "https://restoreassist.app/api/reports/report-1/download?type=summary",
    );
    expect(calledUrl).not.toContain("://restoreassist.app//");
  });
});

describe("bulk-export-zip route source (RA-7451)", () => {
  it("imports getAppUrl and contains no loopback origin literal", () => {
    const routePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "route.ts",
    );
    const src = readFileSync(routePath, "utf8");
    expect(src).toMatch(/import\s+\{\s*getAppUrl\s*\}\s+from\s+"@\/lib\/app-url"/);
    expect(src).toMatch(/const baseUrl = getAppUrl\(\)/);
    expect(src).not.toMatch(/localhost/i);
    expect(src).not.toMatch(/127\.0\.0\.1/);
  });
});
