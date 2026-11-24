/**
 * Guard: /dashboard/support is protected on the server. A client-side redirect
 * alone still renders the support UI into the RSC payload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

describe("/dashboard/support server gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLATFORM_SUPPORT_USER_IDS = "staff-1";
    getServerSession.mockResolvedValue({
      user: { id: "owner-1", role: "ADMIN" },
    });
  });

  it("refuses a business-owner ADMIN who is not a platform operator", async () => {
    findUnique.mockResolvedValue({
      id: "owner-1",
      role: "ADMIN",
      organizationId: "org-1",
    });
    const { default: Layout } = await import("@/app/dashboard/support/layout");
    await expect(Layout({ children: null })).rejects.toThrow(
      /NEXT_NOT_FOUND|NEXT_REDIRECT/,
    );
  });

  it("lets a platform operator through", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "staff-1", role: "ADMIN" },
    });
    findUnique.mockResolvedValue({
      id: "staff-1",
      role: "ADMIN",
      organizationId: "org-1",
    });
    const { default: Layout } = await import("@/app/dashboard/support/layout");
    await expect(Layout({ children: "ok" })).resolves.toBe("ok");
  });
});
