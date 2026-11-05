/**
 * Layouts and pages render in PARALLEL in this Next.js (installed docs:
 * 01-app/02-guides/authentication.md, "Layouts and auth checks"). A layout
 * gate does not stop a server page from running or entering the RSC payload,
 * so every SERVER page under the platform staff segments must run the gate
 * itself. Client pages only fetch from the browser, through platform-gated
 * APIs, after the layout gate has passed.
 *
 * 1. Static guard: every page.tsx under app/dashboard/admin/** and
 *    app/dashboard/margot/** that is not "use client" calls
 *    requirePlatformSupportPage().
 * 2. Render test: Content Gate (the server page that leaked ~19 KB with the
 *    allowlist unset) returns notFound for a business owner, through the real
 *    requirePlatformSupportPage -> requireAdminPage path.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, userFindUnique, redirect, notFound } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
  notFound: () => notFound(),
}));

import ContentGatePage from "@/app/dashboard/admin/content-gate/page";

const ROOT = resolve(__dirname, "../../..");
const SEGMENTS = ["app/dashboard/admin", "app/dashboard/margot"];

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" ? [] : pageFiles(full);
    }
    return name === "page.tsx" ? [full] : [];
  });
}

/** True when the module's first statement is the "use client" directive. */
function isClientModule(source: string): boolean {
  const body = source
    .replace(/^﻿/, "")
    .replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^["']use client["']/.test(body);
}

describe("server pages under platform staff segments gate themselves", () => {
  const pages = SEGMENTS.flatMap((s) => pageFiles(join(ROOT, s)));
  const serverPages = pages.filter((p) => !isClientModule(readFileSync(p, "utf8")));

  it("finds the pages it guards (scan is not empty)", () => {
    expect(pages.length).toBeGreaterThan(10);
    expect(serverPages.map((p) => relative(ROOT, p))).toContain(
      "app/dashboard/admin/content-gate/page.tsx",
    );
  });

  it("every server page awaits requirePlatformSupportPage()", () => {
    const ungated = serverPages
      .filter((p) => !/await\s+requirePlatformSupportPage\(\)/.test(readFileSync(p, "utf8")))
      .map((p) => relative(ROOT, p));
    expect(ungated).toEqual([]);
  });
});

describe("Content Gate page renders only for platform support operators", () => {
  const OPERATOR = "staff_operator_cg";
  const OWNER = "business_owner_cg";

  function signIn(id: string, role = "ADMIN") {
    getServerSession.mockResolvedValue({ user: { id, role } });
    userFindUnique.mockResolvedValue({ id, role, organizationId: "org_1" });
  }

  beforeEach(() => {
    getServerSession.mockReset();
    userFindUnique.mockReset();
    redirect.mockClear();
    notFound.mockClear();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("a business owner (ADMIN, not allowlisted) gets notFound and no content", async () => {
    signIn(OWNER);
    await expect(Promise.resolve().then(() => ContentGatePage())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("fails closed with the allowlist unset", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    signIn(OPERATOR);
    await expect(Promise.resolve().then(() => ContentGatePage())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("a MANAGER is redirected before the allowlist is consulted", async () => {
    signIn(OPERATOR, "MANAGER");
    await expect(Promise.resolve().then(() => ContentGatePage())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("positive control: an allowlisted ADMIN gets the page", async () => {
    signIn(OPERATOR);
    const tree = await Promise.resolve().then(() => ContentGatePage());
    expect(tree).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
