/**
 * RA-7893 — getResourceTenantOwner: the invite-matching rule that decides
 * whether an invited member's CURRENT organisation is the one a resource was
 * created in.
 *
 * The prisma fake evaluates the `where` the real code sends (organisation,
 * usedAt, the OR of acceptedUserId / legacy email match, and the email
 * `mode`), so a change to that query changes the outcome here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Invite = {
  organizationId: string;
  acceptedUserId: string | null;
  email: string;
  usedAt: Date | null;
};

const db = vi.hoisted(() => ({
  users: {} as Record<
    string,
    {
      id: string;
      role: string;
      organizationId: string | null;
      email: string;
      ownerId: string | null;
    }
  >,
  invites: [] as Invite[],
}));

type EmailFilter = { equals: string; mode?: "insensitive" | "default" };
type Branch = { acceptedUserId?: string | null; email?: EmailFilter };

function matchesBranch(invite: Invite, branch: Branch): boolean {
  if (
    "acceptedUserId" in branch &&
    invite.acceptedUserId !== branch.acceptedUserId
  ) {
    return false;
  }
  if (branch.email) {
    const { equals, mode } = branch.email;
    if (mode === "insensitive") {
      if (invite.email.toLowerCase() !== equals.toLowerCase()) return false;
    } else if (invite.email !== equals) {
      return false;
    }
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users[where.id];
        if (!u) return null;
        return {
          ...u,
          organization: u.organizationId ? { ownerId: u.ownerId } : null,
        };
      },
    },
    userInvite: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: {
          organizationId: string;
          usedAt?: { not: null };
          OR: Branch[];
        };
        orderBy?: { usedAt: "asc" | "desc" };
      }) => {
        const rows = db.invites.filter(
          (i) =>
            i.organizationId === where.organizationId &&
            (!where.usedAt || i.usedAt !== null) &&
            where.OR.some((b) => matchesBranch(i, b)),
        );
        if (orderBy?.usedAt === "desc") {
          rows.sort(
            (a, b) => (b.usedAt?.getTime() ?? 0) - (a.usedAt?.getTime() ?? 0),
          );
        }
        return rows[0] ? { usedAt: rows[0].usedAt } : null;
      },
    },
  },
}));

import {
  getResourceTenantOwner,
  resourceBillsToCaller,
} from "../organization-credits";

const CREATED = new Date("2026-06-01T00:00:00Z");

beforeEach(() => {
  db.users = {
    "tech-a": {
      id: "tech-a",
      role: "USER",
      organizationId: "org-a",
      email: "tech-a@example.com",
      ownerId: "owner-a",
    },
  };
  db.invites = [];
});

describe("getResourceTenantOwner — legacy invites without acceptedUserId (RA-7893)", () => {
  it("matches the invite email case-insensitively and returns the owner when the invite was used before the resource was created", async () => {
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: null,
        email: "Tech-A@Example.COM",
        usedAt: new Date("2026-05-01T00:00:00Z"),
      },
    ];
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBe(
      "owner-a",
    );
  });

  it("returns null when the matching invite was used after the resource was created", async () => {
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: null,
        email: "Tech-A@Example.COM",
        usedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ];
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBeNull();
  });

  it("returns null when the only legacy invite is for a different email", async () => {
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: null,
        email: "someone-else@example.com",
        usedAt: new Date("2026-05-01T00:00:00Z"),
      },
    ];
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBeNull();
  });

  it("returns null when an invite with this email was accepted by a DIFFERENT user", async () => {
    // The receipt names who accepted it; an email match cannot override that.
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: "other-user",
        email: "tech-a@example.com",
        usedAt: new Date("2026-05-01T00:00:00Z"),
      },
    ];
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBeNull();
  });
});

describe("resourceBillsToCaller — the one rule for logged-in charges on a resource (RA-7893)", () => {
  beforeEach(() => {
    // tech-a joined org B on 1 July. owner-a and owner-b are each their own
    // billing owner.
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: "org-b",
      email: "tech-a@example.com",
      ownerId: "owner-b",
    };
    db.users["owner-a"] = {
      id: "owner-a",
      role: "ADMIN",
      organizationId: "org-a",
      email: "owner-a@example.com",
      ownerId: "owner-a",
    };
    db.users["owner-b"] = {
      id: "owner-b",
      role: "ADMIN",
      organizationId: "org-b",
      email: "owner-b@example.com",
      ownerId: "owner-b",
    };
    db.invites = [
      {
        organizationId: "org-b",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        usedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ];
  });

  it("refuses the colleague: org B's admin on a job tech-a created before joining org B", async () => {
    await expect(
      resourceBillsToCaller("owner-b", {
        userId: "tech-a",
        createdAt: CREATED,
      }),
    ).resolves.toBe(false);
  });

  it("refuses the creator on their own job from before joining org B", async () => {
    await expect(
      resourceBillsToCaller("tech-a", { userId: "tech-a", createdAt: CREATED }),
    ).resolves.toBe(false);
  });

  it("allows org B's admin and the creator on a job tech-a created after joining org B", async () => {
    const later = {
      userId: "tech-a",
      createdAt: new Date("2026-07-02T00:00:00Z"),
    };
    await expect(resourceBillsToCaller("owner-b", later)).resolves.toBe(true);
    await expect(resourceBillsToCaller("tech-a", later)).resolves.toBe(true);
  });

  it("refuses a caller from another business even when the job's business is proven", async () => {
    const later = {
      userId: "tech-a",
      createdAt: new Date("2026-07-02T00:00:00Z"),
    };
    await expect(resourceBillsToCaller("owner-a", later)).resolves.toBe(false);
  });
});
