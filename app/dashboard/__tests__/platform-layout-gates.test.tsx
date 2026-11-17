/**
 * Every /dashboard/<segment> layout gated through `@/lib/admin-auth` is a
 * RestoreAssist staff surface (admin, margot, governance, mission-control).
 * The segments are DISCOVERED from disk, not typed by hand (RA-8420: a
 * hand-typed list left mission-control on requireAdminPage() alone), so a new
 * admin-gated segment layout is tested the moment it exists. `role: "ADMIN"` is every self-registered business owner, so the
 * segment layouts must require the PLATFORM_SUPPORT_USER_IDS allowlist on top
 * of requireAdminPage(), as /dashboard/governance and
 * /dashboard/admin/founding-trial already do. An owner not on the allowlist
 * gets notFound(); MANAGER and USER are still redirected by requireAdminPage
 * before the allowlist is consulted.
 *
 * requireAdminPage() is the REAL implementation: only the session, the Prisma
 * role re-check and next/navigation are doubled, so the refusal paths are the
 * production ones. Positive control: an allowlisted ADMIN renders the segment.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
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
vi.mock("@/components/admin/MargotSectionChrome", () => ({
  MargotSectionChrome: ({ children }: { children: ReactNode }) => children,
}));


const OPERATOR = "staff_operator_1";
const OWNER = "business_owner_1";

function signIn(id: string, role: string) {
  getServerSession.mockResolvedValue({ user: { id, role } });
  userFindUnique.mockResolvedValue({ id, role, organizationId: "org_1" });
}

/** Unwraps the rendered tree to the children the layout passed through. */
async function rendered(layout: Layout) {
  const out = (await layout({ children: "SEGMENT" })) as
    | string
    | { props: { children: unknown } };
  return typeof out === "string" ? out : out.props.children;
}

type Layout = (p: { children: ReactNode }) => Promise<unknown>;

const DASHBOARD = path.resolve(__dirname, "..");

/** Segments whose layout imports the admin gate: these are staff surfaces. */
const STAFF_SEGMENTS = readdirSync(DASHBOARD, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && d.name !== "__tests__")
  .map((d) => d.name)
  .filter((name) => {
    const file = path.join(DASHBOARD, name, "layout.tsx");
    return existsSync(file) && /@\/lib\/admin-auth/.test(readFileSync(file, "utf8"));
  })
  .sort();

const LAYOUTS: (readonly [string, Layout])[] = await Promise.all(
  STAFF_SEGMENTS.map(
    async (name) =>
      [
        `/dashboard/${name}`,
        (await import(`../${name}/layout.tsx`)).default as Layout,
      ] as const,
  ),
);

it("discovery floor: the known staff segment layouts are all found", () => {
  // Guards the discovery itself: if the scan broke and found nothing, the
  // describe.each below would silently test nothing.
  expect(STAFF_SEGMENTS).toEqual(
    expect.arrayContaining(["admin", "governance", "margot", "mission-control"]),
  );
});

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  redirect.mockClear();
  notFound.mockClear();
  vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", `someone_else, ${OPERATOR}`);
});
afterEach(() => vi.unstubAllEnvs());

describe.each(LAYOUTS)("%s segment layout", (_path, Layout) => {
  it("a business owner (ADMIN, not allowlisted) gets notFound", async () => {
    signIn(OWNER, "ADMIN");
    await expect(Layout({ children: "SEGMENT" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("fails closed when the allowlist is unset", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    signIn(OPERATOR, "ADMIN");
    await expect(Layout({ children: "SEGMENT" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("refuses an owner in development with PLATFORM_SUPPORT_DEV_OPEN and no allowlist", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PLATFORM_SUPPORT_DEV_OPEN", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    signIn(OWNER, "ADMIN");
    await expect(Layout({ children: "SEGMENT" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("positive control: an allowlisted ADMIN renders the segment", async () => {
    signIn(OPERATOR, "ADMIN");
    await expect(rendered(Layout)).resolves.toBe("SEGMENT");
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "USER"])(
    "an allowlisted %s is still redirected by requireAdminPage (allowlist widens ADMIN only)",
    async (role) => {
      signIn(OPERATOR, role);
      await expect(Layout({ children: "SEGMENT" })).rejects.toThrow(
        "NEXT_REDIRECT:/dashboard",
      );
      expect(notFound).not.toHaveBeenCalled();
    },
  );

  it("a signed-out visitor is sent to /login", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(Layout({ children: "SEGMENT" })).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("an ADMIN demoted in the database is redirected, even if allowlisted", async () => {
    getServerSession.mockResolvedValue({ user: { id: OPERATOR, role: "ADMIN" } });
    userFindUnique.mockResolvedValue({ id: OPERATOR, role: "USER", organizationId: "org_1" });
    await expect(Layout({ children: "SEGMENT" })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(notFound).not.toHaveBeenCalled();
  });
});
