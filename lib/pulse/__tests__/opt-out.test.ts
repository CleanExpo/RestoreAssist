import { beforeEach, describe, expect, it, vi } from "vitest";
import { pulseAddressTag } from "../pulse-unsubscribe-token";

type ClientRow = {
  id: string;
  userId: string;
  email: string;
  pulseOptOut: boolean;
};
type UserRow = {
  id: string;
  organizationId: string | null;
  organizationLeftId?: string | null;
  organizationLeftAt?: Date | null;
};
type OrgLock = {
  organizationId: string;
  addressTag: string;
  sourceClientId?: string | null;
  sourceUserId?: string | null;
};

const db = vi.hoisted(() => ({
  users: {} as Record<string, UserRow>,
  orgs: {} as Record<string, { id: string; ownerId: string }>,
  clients: [] as ClientRow[],
  locks: [] as OrgLock[],
  lockCalls: [] as string[],
  getResourceTenant: vi.fn(),
}));

function eqEmail(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

vi.mock("@/lib/prisma", () => {
  const client = {
    findFirst: async ({
      where,
    }: {
      where: {
        userId?: string | { in: string[] };
        pulseOptOut?: boolean;
        email?: { equals: string; mode: string };
        id?: string;
      };
    }) =>
      db.clients.find((row) => {
        if (where.pulseOptOut === true && !row.pulseOptOut) return false;
        if (typeof where.userId === "string" && row.userId !== where.userId) {
          return false;
        }
        if (
          where.userId &&
          typeof where.userId === "object" &&
          !where.userId.in.includes(row.userId)
        ) {
          return false;
        }
        if (where.email && !eqEmail(row.email, where.email.equals)) return false;
        if (where.id && row.id !== where.id) return false;
        return true;
      }) ?? null,
    findMany: async ({
      where,
    }: {
      where: { userId?: string | { in: string[] } };
    }) =>
      db.clients.filter((row) => {
        if (typeof where.userId === "string") return row.userId === where.userId;
        if (where.userId && typeof where.userId === "object") {
          return where.userId.in.includes(row.userId);
        }
        return true;
      }),
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        userId?: string | { in: string[] };
        email?: { equals: string; mode: string };
        id?: string | { in: string[] };
      };
      data: { pulseOptOut: boolean };
    }) => {
      let count = 0;
      for (const row of db.clients) {
        if (typeof where.userId === "string" && row.userId !== where.userId) {
          continue;
        }
        if (
          where.userId &&
          typeof where.userId === "object" &&
          !where.userId.in.includes(row.userId)
        ) {
          continue;
        }
        if (where.email && !eqEmail(row.email, where.email.equals)) continue;
        if (typeof where.id === "string" && row.id !== where.id) continue;
        if (
          where.id &&
          typeof where.id === "object" &&
          !where.id.in.includes(row.id)
        ) {
          continue;
        }
        row.pulseOptOut = data.pulseOptOut;
        count += 1;
      }
      return { count };
    },
  };
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.users[where.id] ?? null,
      findMany: async ({
        where,
      }: {
        where: {
          organizationId?: string;
          organizationLeftId?: string;
          organizationLeftAt?: { not: null };
        };
      }) =>
        Object.values(db.users).filter((u) => {
          if (where.organizationLeftId) {
            if (u.organizationLeftId !== where.organizationLeftId) return false;
            if (!u.organizationLeftAt) return false;
            if (where.organizationId === null && u.organizationId !== null) {
              return false;
            }
            return true;
          }
          if (where.organizationId) {
            return u.organizationId === where.organizationId;
          }
          return true;
        }),
    },
    organization: {
      findFirst: async ({
        where,
      }: {
        where: { ownerId: string };
      }) =>
        Object.values(db.orgs).find((o) => o.ownerId === where.ownerId) ?? null,
    },
    client,
    pulseOrgAddressOptOut: {
      findUnique: async ({
        where,
      }: {
        where: {
          organizationId_addressTag: {
            organizationId: string;
            addressTag: string;
          };
        };
      }) => {
        const key = where.organizationId_addressTag;
        return (
          db.locks.find(
            (row) =>
              row.organizationId === key.organizationId &&
              row.addressTag === key.addressTag,
          ) ?? null
        );
      },
      findFirst: async ({
        where,
      }: {
        where: { organizationId?: string; sourceClientId?: string };
      }) =>
        db.locks.find(
          (row) =>
            (!where.organizationId ||
              row.organizationId === where.organizationId) &&
            (!where.sourceClientId ||
              row.sourceClientId === where.sourceClientId),
        ) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: {
          organizationId_addressTag: {
            organizationId: string;
            addressTag: string;
          };
        };
        create: OrgLock;
      }) => {
        const key = where.organizationId_addressTag;
        const existing = db.locks.find(
          (row) =>
            row.organizationId === key.organizationId &&
            row.addressTag === key.addressTag,
        );
        if (existing) return existing;
        db.locks.push(create);
        return create;
      },
    },
    $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    $executeRaw: async (strings: TemplateStringsArray, key: string) => {
      db.lockCalls.push(String(strings.join("?") + key));
    },
  };
  return { prisma };
});

vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: (...args: unknown[]) => db.getResourceTenant(...args),
}));

import {
  isPulseOptedOutByAddress,
  recordPulseAddressLock,
  recordPulseOptOut,
  resolvePulseJobOrganisationId,
  resolvePulseOrganisationId,
} from "../opt-out";

beforeEach(() => {
  process.env.PORTAL_SECRET = "test-secret";
  db.users = {};
  db.orgs = {};
  db.clients = [];
  db.locks = [];
  db.lockCalls = [];
  db.getResourceTenant.mockReset();
});

function staff(
  id: string,
  organizationId: string | null,
  extra: Partial<UserRow> = {},
) {
  db.users[id] = { id, organizationId, ...extra };
}

function client(row: ClientRow) {
  db.clients.push(row);
}

describe("Pulse consent (RA-8156, RA-7979)", () => {
  it("resolves the organisation, not the staff user, as the business identity", async () => {
    staff("staff-a", "org-1");
    staff("staff-b", "org-1");
    db.orgs["org-1"] = { id: "org-1", ownerId: "owner-1" };

    expect(await resolvePulseOrganisationId("staff-a")).toBe("org-1");
    expect(await resolvePulseOrganisationId("staff-b")).toBe("org-1");
  });

  it("staff A withdrawal blocks staff B send in the same organisation", async () => {
    staff("staff-a", "org-1");
    staff("staff-b", "org-1");
    client({
      id: "client-a",
      userId: "staff-a",
      email: "home@owner.test",
      pulseOptOut: false,
    });
    client({
      id: "client-b",
      userId: "staff-b",
      email: "home@owner.test",
      pulseOptOut: false,
    });

    await recordPulseOptOut({
      clientId: "client-a",
      ownerUserId: "staff-a",
      email: "home@owner.test",
    });

    expect(await isPulseOptedOutByAddress("staff-a", "home@owner.test")).toBe(
      true,
    );
    expect(await isPulseOptedOutByAddress("staff-b", "HOME@owner.test")).toBe(
      true,
    );
    expect(db.clients.every((row) => row.pulseOptOut)).toBe(true);
  });

  it("does not leak a withdrawal into a different organisation", async () => {
    staff("staff-a", "org-1");
    staff("staff-other", "org-2");
    client({
      id: "client-a",
      userId: "staff-a",
      email: "home@owner.test",
      pulseOptOut: false,
    });
    client({
      id: "client-other",
      userId: "staff-other",
      email: "home@owner.test",
      pulseOptOut: false,
    });

    await recordPulseOptOut({
      clientId: "client-a",
      ownerUserId: "staff-a",
      email: "home@owner.test",
    });

    expect(await isPulseOptedOutByAddress("staff-a", "home@owner.test")).toBe(
      true,
    );
    expect(
      await isPulseOptedOutByAddress("staff-other", "home@owner.test"),
    ).toBe(false);
    expect(db.clients.find((row) => row.id === "client-other")?.pulseOptOut).toBe(
      false,
    );
  });

  it("users without an organisation stay isolated from each other", async () => {
    staff("solo-a", null);
    staff("solo-b", null);
    client({
      id: "client-a",
      userId: "solo-a",
      email: "home@owner.test",
      pulseOptOut: false,
    });
    client({
      id: "client-b",
      userId: "solo-b",
      email: "home@owner.test",
      pulseOptOut: false,
    });

    await recordPulseOptOut({
      clientId: "client-a",
      ownerUserId: "solo-a",
      email: "home@owner.test",
    });

    expect(await isPulseOptedOutByAddress("solo-a", "home@owner.test")).toBe(
      true,
    );
    expect(await isPulseOptedOutByAddress("solo-b", "home@owner.test")).toBe(
      false,
    );
  });

  it("keeps the person's opt-out after their email is replaced", async () => {
    staff("staff-a", "org-1");
    client({
      id: "client-a",
      userId: "staff-a",
      email: "old@owner.test",
      pulseOptOut: false,
    });

    await recordPulseOptOut({
      clientId: "client-a",
      ownerUserId: "staff-a",
      email: "old@owner.test",
    });

    db.clients[0].email = "new@owner.test";

    expect(db.clients[0].pulseOptOut).toBe(true);
    expect(await isPulseOptedOutByAddress("staff-a", "old@owner.test")).toBe(
      true,
    );
    expect(await isPulseOptedOutByAddress("staff-a", "new@owner.test")).toBe(
      false,
    );

    client({
      id: "client-other",
      userId: "staff-a",
      email: "new@owner.test",
      pulseOptOut: false,
    });
    expect(await isPulseOptedOutByAddress("staff-a", "new@owner.test")).toBe(
      false,
    );
  });

  it("locks the withdrawn address so a new client row cannot resume mail", async () => {
    staff("staff-a", "org-1");
    staff("staff-b", "org-1");
    client({
      id: "client-a",
      userId: "staff-a",
      email: "replacement@owner.test",
      pulseOptOut: true,
    });

    await recordPulseAddressLock({
      ownerUserId: "staff-a",
      email: "old@owner.test",
      sourceClientId: "client-a",
    });
    client({
      id: "client-new",
      userId: "staff-b",
      email: "old@owner.test",
      pulseOptOut: false,
    });

    expect(await isPulseOptedOutByAddress("staff-b", "old@owner.test")).toBe(
      true,
    );
    expect(db.locks[0].addressTag).toBe(pulseAddressTag("old@owner.test"));
  });

  it("honours a legacy staff-level Client.pulseOptOut for a colleague", async () => {
    staff("staff-a", "org-1");
    staff("staff-b", "org-1");
    client({
      id: "client-a",
      userId: "staff-a",
      email: "home@owner.test",
      pulseOptOut: true,
    });

    expect(await isPulseOptedOutByAddress("staff-b", "home@owner.test")).toBe(
      true,
    );
    expect(db.locks).toHaveLength(1);
    expect(db.locks[0].organizationId).toBe("org-1");
  });

  it("does not let a former member's later opt-out lock the organisation they left", async () => {
    staff("ex-staff", null, {
      organizationLeftId: "org-1",
      organizationLeftAt: new Date("2026-10-01"),
    });
    staff("staff-b", "org-1");
    client({
      id: "client-ex",
      userId: "ex-staff",
      email: "home@owner.test",
      pulseOptOut: true,
    });

    expect(await isPulseOptedOutByAddress("staff-b", "home@owner.test")).toBe(
      false,
    );
  });

  it("does not scan a former member who has joined another organisation", async () => {
    staff("ex-staff", "org-2", {
      organizationLeftId: "org-1",
      organizationLeftAt: new Date("2026-10-01"),
    });
    staff("staff-b", "org-1");
    client({
      id: "client-ex",
      userId: "ex-staff",
      email: "home@owner.test",
      pulseOptOut: true,
    });

    expect(await isPulseOptedOutByAddress("staff-b", "home@owner.test")).toBe(
      false,
    );
  });

  it("locks the pinned organisation rather than the owner's live firm", async () => {
    staff("staff-a", "org-live");
    db.orgs["org-live"] = { id: "org-live", ownerId: "staff-a" };

    await recordPulseAddressLock({
      ownerUserId: "staff-a",
      email: "home@owner.test",
      sourceClientId: "client-a",
      organizationId: "org-sent",
    });

    expect(db.locks).toHaveLength(1);
    expect(db.locks[0].organizationId).toBe("org-sent");
  });

  it("uses the pinned organisation, not the owner's live firm", async () => {
    staff("staff-a", "org-live");
    db.orgs["org-live"] = { id: "org-live", ownerId: "staff-a" };
    db.locks.push({
      organizationId: "org-sent",
      addressTag: pulseAddressTag("home@owner.test"),
    });

    expect(
      await isPulseOptedOutByAddress("staff-a", "home@owner.test", "org-sent"),
    ).toBe(true);
    expect(
      await isPulseOptedOutByAddress("staff-a", "home@owner.test", "org-live"),
    ).toBe(false);
  });

  it("pins the owner's organisation when the job tenant is self", async () => {
    staff("owner-a", "org-1");
    db.orgs["org-1"] = { id: "org-1", ownerId: "owner-a" };
    db.getResourceTenant.mockResolvedValue({
      ownerId: "owner-a",
      organizationId: null,
    });

    expect(
      await resolvePulseJobOrganisationId(
        "owner-a",
        new Date("2026-06-01T00:00:00Z"),
      ),
    ).toBe("org-1");
  });

  it("does not guess a live firm when the job tenant is unproven", async () => {
    staff("tech-a", "org-live");
    db.getResourceTenant.mockResolvedValue(null);

    expect(
      await resolvePulseJobOrganisationId(
        "tech-a",
        new Date("2026-06-01T00:00:00Z"),
      ),
    ).toBeNull();
  });

  it("fail-closes the address check when the unsubscribe secret is missing", async () => {
    staff("staff-a", "org-1");
    delete process.env.PORTAL_SECRET;
    delete process.env.CLIENT_PORTAL_JWT_SECRET;

    expect(await isPulseOptedOutByAddress("staff-a", "home@owner.test")).toBe(
      true,
    );
  });

  it("takes an organisation+address advisory lock for a write", async () => {
    staff("staff-a", "org-1");
    client({
      id: "client-a",
      userId: "staff-a",
      email: "home@owner.test",
      pulseOptOut: false,
    });

    await recordPulseOptOut({
      clientId: "client-a",
      ownerUserId: "staff-a",
      email: "home@owner.test",
    });

    expect(db.lockCalls.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(
      true,
    );
  });
});
