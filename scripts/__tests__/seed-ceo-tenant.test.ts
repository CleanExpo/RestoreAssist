/**
 * prisma/seed-ceo.ts must not create a non-owner ADMIN.
 *
 * Pricing and setup routes gate on verifyTenantAdmin, which requires an ADMIN
 * to own their organisation (RA-7647). Elevating a CEO account that is a
 * member of an organisation someone else owns would produce an ADMIN locked
 * out of pricing, so the seed refuses before writing anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    user = { findUnique: db.findUnique, update: db.update, create: db.create };
    $disconnect = db.disconnect;
  },
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("pg", () => ({ Pool: class {} }));
vi.mock("@/lib/prisma-pool-config", () => ({ pgPoolTls: () => ({}) }));

const PRIMARY = "phill.mcgurk@gmail.com";

let exit: ReturnType<typeof vi.spyOn>;

async function runSeed() {
  vi.resetModules();
  await import("../../prisma/seed-ceo");
  await vi.waitFor(() => expect(db.disconnect).toHaveBeenCalled());
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic@127.0.0.1:1/none");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  db.update.mockResolvedValue({});
  db.create.mockResolvedValue({});
  db.disconnect.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CEO seed tenancy", () => {
  it("refuses to elevate an account that belongs to someone else's organisation", async () => {
    db.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
      where.email === PRIMARY
        ? { id: "ceo-1", password: "hash", organizationId: "org-x", organization: { ownerId: "other-owner" } }
        : null);

    await runSeed();

    expect(db.update).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("elevates an account that owns its organisation", async () => {
    db.findUnique.mockResolvedValue({
      id: "ceo-1", password: "hash", organizationId: "org-own", organization: { ownerId: "ceo-1" },
    });

    await runSeed();

    expect(db.update).toHaveBeenCalledTimes(2);
    expect(exit).not.toHaveBeenCalled();
  });

  it("elevates an org-less account", async () => {
    db.findUnique.mockResolvedValue({ id: "ceo-1", password: null, organizationId: null, organization: null });

    await runSeed();

    expect(db.update).toHaveBeenCalledTimes(2);
    expect(exit).not.toHaveBeenCalled();
  });
});
