/**
 * RA-8665 — the one rule for whether add-on checkout would find a workspace.
 * Runs the real seatWorkspaceFor over a small in-memory workspace table, so a
 * rule that ignores a workspace's status, or writes anything, fails here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ws = { id: string; ownerId: string; status: string; createdAt: number };
const db = vi.hoisted(() => ({
  workspaces: [] as { id: string; ownerId: string; status: string; createdAt: number }[],
  users: new Map<string, { email: string | null }>(),
  writes: 0,
}));

vi.mock("@/lib/prisma", () => {
  const findFirst = vi.fn(
    async (args: { where: { ownerId: string; status?: string } }) => {
      const rows = db.workspaces
        .filter((w) => w.ownerId === args.where.ownerId)
        .filter((w) => args.where.status === undefined || w.status === args.where.status)
        .sort((a, b) => a.createdAt - b.createdAt);
      return rows[0] ? { id: rows[0].id, status: rows[0].status } : null;
    },
  );
  const write = vi.fn(async () => {
    db.writes += 1;
    throw new Error("addonCheckoutHasWorkspace must not write");
  });
  return {
    prisma: {
      workspace: { findFirst, update: write, create: write, updateMany: write },
      user: {
        findUnique: vi.fn(async (args: { where: { id: string } }) => db.users.get(args.where.id) ?? null),
        update: write,
      },
    },
  };
});
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));

import { addonCheckoutHasWorkspace } from "../addon-checkout-workspace";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

function owns(...rows: Omit<Ws, "ownerId">[]) {
  for (const r of rows) db.workspaces.push({ ...r, ownerId: "u1" });
}

beforeEach(() => {
  db.workspaces = [];
  db.users = new Map([["u1", { email: "owner@example.test" }]]);
  db.writes = 0;
  vi.mocked(getWorkspaceForUser).mockReset();
});

describe("addonCheckoutHasWorkspace", () => {
  it("RA-8665: a pack that is not a seat follows getWorkspaceForUser exactly", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValueOnce({ id: "ws_1", name: "Fixture" });
    expect(await addonCheckoutHasWorkspace("u1", false)).toBe(true);
    vi.mocked(getWorkspaceForUser).mockResolvedValueOnce(null);
    expect(await addonCheckoutHasWorkspace("u1", false)).toBe(false);
  });

  it("RA-8665: a seat is refused when the owner's only workspace is SUSPENDED", async () => {
    owns({ id: "ws_s", status: "SUSPENDED", createdAt: 1 });
    expect(await addonCheckoutHasWorkspace("u1", true)).toBe(false);
  });

  it("RA-8665: a seat finds a READY owned workspace even behind an older SUSPENDED one", async () => {
    owns(
      { id: "ws_s", status: "SUSPENDED", createdAt: 1 },
      { id: "ws_r", status: "READY", createdAt: 2 },
    );
    expect(await addonCheckoutHasWorkspace("u1", true)).toBe(true);
  });

  it("RA-8665: a seat is offered when the oldest owned workspace is PROVISIONING (checkout promotes it)", async () => {
    owns({ id: "ws_p", status: "PROVISIONING", createdAt: 1 });
    expect(await addonCheckoutHasWorkspace("u1", true)).toBe(true);
  });

  it("RA-8665: a seat is refused when the oldest owned workspace is in any other state, such as FAILED", async () => {
    owns(
      { id: "ws_f", status: "FAILED", createdAt: 1 },
      { id: "ws_p", status: "PROVISIONING", createdAt: 2 },
    );
    expect(await addonCheckoutHasWorkspace("u1", true)).toBe(false);
  });

  it("RA-8665: an owner with no workspace gets a seat only when checkout can provision one (an email)", async () => {
    expect(await addonCheckoutHasWorkspace("u1", true)).toBe(true);
    db.users.set("u1", { email: null });
    expect(await addonCheckoutHasWorkspace("u1", true)).toBe(false);
  });

  it("RA-8665: the seat answer ignores memberships (getWorkspaceForUser) and never writes", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue({ id: "ws_member", name: "Elsewhere" });
    owns({ id: "ws_s", status: "SUSPENDED", createdAt: 1 });
    expect(await addonCheckoutHasWorkspace("u1", true)).toBe(false);
    expect(getWorkspaceForUser).not.toHaveBeenCalled();
    expect(db.writes).toBe(0);
  });
});
