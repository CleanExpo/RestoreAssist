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
  createdAt?: Date;
  acceptanceProvider?: string | null;
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
      organizationLeftAt?: Date | null;
      organizationLeftId?: string | null;
    }
  >,
  invites: [] as Invite[],
  orgOwners: { "org-a": "owner-a", "org-b": "owner-b" } as Record<
    string,
    string
  >,
  entitledWorkspaces: [] as string[],
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
          organizationId?: string;
          usedAt?: { not: null; lte?: Date; lt?: Date };
          OR: Branch[];
        };
        orderBy?: { usedAt: "asc" | "desc" };
      }) => {
        const lte = where.usedAt?.lte;
        const lt = where.usedAt?.lt;
        const rows = db.invites.filter(
          (i) =>
            (where.organizationId === undefined ||
              i.organizationId === where.organizationId) &&
            (!where.usedAt || i.usedAt !== null) &&
            (!lte || (i.usedAt !== null && i.usedAt <= lte)) &&
            (!lt || (i.usedAt !== null && i.usedAt < lt)) &&
            where.OR.some((b) => matchesBranch(i, b)),
        );
        if (orderBy?.usedAt === "desc") {
          rows.sort(
            (a, b) => (b.usedAt?.getTime() ?? 0) - (a.usedAt?.getTime() ?? 0),
          );
        }
        return rows[0]
          ? {
              usedAt: rows[0].usedAt,
              createdAt: rows[0].createdAt,
              acceptedUserId: rows[0].acceptedUserId,
              acceptanceProvider: rows[0].acceptanceProvider ?? null,
              organizationId: rows[0].organizationId,
              organization: { ownerId: db.orgOwners[rows[0].organizationId] },
            }
          : null;
      },
    },
    workspace: {
      findFirst: async ({ where }: { where: { ownerId: string } }) =>
        where.ownerId === "owner-a"
          ? { id: "ws-a", name: "A" }
          : where.ownerId === "owner-b"
            ? { id: "ws-b", name: "B" }
            : null,
    },
    featureEntitlement: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_sku: { workspaceId: string; sku: string } };
      }) =>
        db.entitledWorkspaces.includes(where.workspaceId_sku.workspaceId)
          ? { id: "fe", active: true }
          : null,
    },
  },
}));

import {
  getResourceTenantOwner,
  resourceBillsToCaller,
} from "../organization-credits";
import { isAddonEntitledForResource } from "@/lib/entitlements";

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

describe("getResourceTenantOwner — removed member (RA-7893 P1-REMOVED-MEMBER-OLD-JOB-USES-PERSONAL-ADDON)", () => {
  // tech-a joined org A on 1 May, created a job on 1 June, and was removed
  // from org A on 1 August (organizationId cleared).
  beforeEach(() => {
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: null,
      email: "tech-a@example.com",
      ownerId: null,
      organizationLeftAt: new Date("2026-08-01T00:00:00Z"),
      organizationLeftId: "org-a",
    };
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        usedAt: new Date("2026-05-01T00:00:00Z"),
      },
    ];
  });

  it("bills a job made while in org A to org A's owner, not the ex-member", async () => {
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBe(
      "owner-a",
    );
  });

  it("gives the ex-member a job they made after leaving", async () => {
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-09-01T00:00:00Z")),
    ).resolves.toBe("tech-a");
  });

  it("fails closed for a removal with no leave date on record", async () => {
    db.users["tech-a"].organizationLeftAt = null;
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBeNull();
  });

  it("fails closed on a job made before the last join (an earlier membership may have been erased)", async () => {
    db.invites[0].usedAt = new Date("2026-07-01T00:00:00Z");
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBeNull();
  });

  it("gives a user who never accepted an invite their own job", async () => {
    db.invites = [];
    db.users["tech-a"].organizationLeftAt = null;
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBe(
      "tech-a",
    );
  });
});

describe("getResourceTenantOwner — owner account deleted (RA-7893 P1-OWNER-DELETION-ERASES-TENANT-RECEIPT)", () => {
  // Deleting org A's owner cascaded org A and its invites and nulled
  // tech-a's organizationId; account delete stamped the leave date (1 Aug).
  beforeEach(() => {
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: null,
      email: "tech-a@example.com",
      ownerId: null,
      organizationLeftAt: new Date("2026-08-01T00:00:00Z"),
      organizationLeftId: "org-a",
    };
    db.invites = [];
  });

  it("fails closed for a job made before the leave date when the invite history is gone", async () => {
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBeNull();
  });

  it("gives the user a job they made after the leave date", async () => {
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-09-01T00:00:00Z")),
    ).resolves.toBe("tech-a");
  });
});

describe("getResourceTenantOwner — which organisation was left (RA-7893 P1-OWNER-DELETION-SURVIVING-INVITE-CROSS-TENANT)", () => {
  const JOB = new Date("2026-07-01T00:00:00Z");
  function leftOrgA() {
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: null,
      email: "tech-a@example.com",
      ownerId: null,
      organizationLeftAt: new Date("2026-08-01T00:00:00Z"),
      organizationLeftId: "org-a",
    };
  }
  const inviteB = {
    organizationId: "org-b",
    acceptedUserId: "tech-a",
    email: "tech-a@example.com",
    usedAt: new Date("2026-05-01T00:00:00Z"),
  };
  const inviteA = {
    organizationId: "org-a",
    acceptedUserId: "tech-a",
    email: "tech-a@example.com",
    usedAt: new Date("2026-06-01T00:00:00Z"),
  };

  it("Codex's history: B earlier, A's invite erased by A's owner deleting, job in A — null, never owner-b", async () => {
    leftOrgA();
    db.invites = [inviteB];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBeNull();
  });

  it("normal removal from A: owner-a", async () => {
    leftOrgA();
    db.invites = [inviteB, inviteA];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBe(
      "owner-a",
    );
  });

  it("owner of A deleted, no invites left: null", async () => {
    leftOrgA();
    db.invites = [];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBeNull();
  });

  it("job before joining A (A's invite is later): null", async () => {
    leftOrgA();
    db.invites = [{ ...inviteA, usedAt: new Date("2026-07-15T00:00:00Z") }];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBeNull();
  });

  it("job after leaving A: the creator", async () => {
    leftOrgA();
    db.invites = [inviteB, inviteA];
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-09-01T00:00:00Z")),
    ).resolves.toBe("tech-a");
  });

  it("a leave date with no recorded organisation: null", async () => {
    leftOrgA();
    db.users["tech-a"].organizationLeftId = null;
    db.invites = [inviteB, inviteA];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBeNull();
  });
});

describe("getResourceTenantOwner — only the last membership interval is trusted (RA-7893 P1-REJOINED-ORG-CLAIMS-PERSONAL-JOB)", () => {
  it("Codex's rejoin history: joined A 01/05, left, personal job 01/07, rejoined A 01/08, left 01/09 — null, never owner-a", async () => {
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: null,
      email: "tech-a@example.com",
      ownerId: null,
      organizationLeftAt: new Date("2026-09-01T00:00:00Z"),
      organizationLeftId: "org-a",
    };
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        usedAt: new Date("2026-05-01T00:00:00Z"),
      },
      {
        organizationId: "org-a",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        usedAt: new Date("2026-08-01T00:00:00Z"),
      },
    ];
    // The job predates the last join into A, and an earlier membership
    // (the first A interval) is not recorded well enough to place it.
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-07-01T00:00:00Z")),
    ).resolves.toBeNull();
  });
});

describe("getResourceTenantOwner — erased earlier membership (RA-7893 P1-ERASED-EARLIER-INVITE-LENDS-PERSONAL-ADDON)", () => {
  it("Codex's history: B joined in May, B job 01/06, B's owner deleted (invites erased), joined A 01/08, left 01/10 — null, never the creator", async () => {
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: null,
      email: "tech-a@example.com",
      ownerId: null,
      organizationLeftAt: new Date("2026-10-01T00:00:00Z"),
      organizationLeftId: "org-a",
    };
    // Only the A invite survives; B's invite went with B.
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        usedAt: new Date("2026-08-01T00:00:00Z"),
      },
    ];
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-06-01T00:00:00Z")),
    ).resolves.toBeNull();
  });
});

describe("getResourceTenantOwner — a same-organisation role change is not a join (RA-7893 P1-ROLE-CHANGE-AUDIT-INVITE-RESETS-JOIN)", () => {
  // tech-a accepted org A's invite on 01/05, made a job on 01/06, had their
  // role changed inside A on 01/07 (POST /api/team/invites writes an audit
  // UserInvite with usedAt = createdAt and no acceptedUserId), and was
  // removed from A on 01/08.
  const JOB = new Date("2026-06-01T00:00:00Z");
  const accepted = {
    organizationId: "org-a",
    acceptedUserId: "tech-a",
    email: "tech-a@example.com",
    createdAt: new Date("2026-04-28T00:00:00Z"),
    usedAt: new Date("2026-05-01T00:00:00Z"),
    acceptanceProvider: "credentials",
  };
  function audit(provider: string | null) {
    // After the direct-add era (lib/billing/invite-membership), so an
    // unmarked instant row here is unambiguously a role change.
    const at = new Date("2026-10-10T00:00:00Z");
    return {
      organizationId: "org-a",
      acceptedUserId: null,
      email: "tech-a@example.com",
      createdAt: at,
      usedAt: at,
      acceptanceProvider: provider,
    };
  }
  beforeEach(() => {
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: null,
      email: "tech-a@example.com",
      ownerId: null,
      organizationLeftAt: new Date("2026-10-20T00:00:00Z"),
      organizationLeftId: "org-a",
    };
    db.entitledWorkspaces = ["ws-a"];
  });

  it("Codex's history with an audit row written before the marker existed: owner-a", async () => {
    db.invites = [accepted, audit(null)];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBe(
      "owner-a",
    );
  });

  it("the same history with a marked audit row: owner-a", async () => {
    db.invites = [accepted, audit("role-change-audit")];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBe(
      "owner-a",
    );
  });

  it("the job keeps org A's add-on through the entitlement path", async () => {
    db.invites = [accepted, audit(null)];
    await expect(
      isAddonEntitledForResource("tech-a", JOB, "CLIENT_EDUCATION"),
    ).resolves.toBe(true);
  });

  it("a current member's older job still resolves to the owner after a role change", async () => {
    db.users["tech-a"] = {
      id: "tech-a",
      role: "USER",
      organizationId: "org-a",
      email: "tech-a@example.com",
      ownerId: "owner-a",
    };
    db.invites = [accepted, audit(null)];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBe(
      "owner-a",
    );
  });

  it("an instant row with no earlier acceptance is a direct add, so it is the join", async () => {
    // Before April 2026 the route also created members directly and wrote
    // an already-used invite in the same insert. With nothing earlier, that
    // row is the membership start: the job before it is not org A's.
    db.invites = [audit(null)];
    await expect(getResourceTenantOwner("tech-a", JOB)).resolves.toBeNull();
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-10-11T00:00:00Z")),
    ).resolves.toBe("owner-a");
  });
});

describe("getResourceTenantOwner — unmarked instant rows from the direct-add era are ambiguous (RA-7893 P1-LEGACY-DIRECT-READD-MISCLASSIFIED-AS-AUDIT)", () => {
  // Between d96d9f081 (2026-01-16) and production running 9352cbe38
  // (proven live by 2026-10-03), POST /api/team/invites wrote the same
  // instant, unreceipted row for a role change AND for directly adding or
  // re-adding a member. Such a row may be a membership start.
  const member = {
    id: "tech-a",
    role: "USER",
    organizationId: "org-a",
    email: "tech-a@example.com",
    ownerId: "owner-a",
  };
  function instant(at: string) {
    return {
      organizationId: "org-a",
      acceptedUserId: null,
      email: "tech-a@example.com",
      createdAt: new Date(at),
      usedAt: new Date(at),
      acceptanceProvider: null,
    };
  }

  it("Codex's repro: legacy accept 02/01, removed, instant re-add 01/03; a 01/02 job in the gap is null, not owner-a", async () => {
    db.users["tech-a"] = { ...member };
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: null,
        email: "tech-a@example.com",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        usedAt: new Date("2026-01-02T00:00:00Z"),
        acceptanceProvider: null,
      },
      instant("2026-03-01T00:00:00Z"),
    ];
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-02-01T00:00:00Z")),
    ).resolves.toBeNull();
    // At or after the ambiguous row the user was a member either way.
    await expect(
      getResourceTenantOwner("tech-a", new Date("2026-03-02T00:00:00Z")),
    ).resolves.toBe("owner-a");
  });

  it("inside the era, a role-change-shaped row fails closed for jobs before it", async () => {
    db.users["tech-a"] = { ...member };
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        createdAt: new Date("2026-04-28T00:00:00Z"),
        usedAt: new Date("2026-05-01T00:00:00Z"),
        acceptanceProvider: "credentials",
      },
      instant("2026-07-01T00:00:00Z"),
    ];
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBeNull();
  });

  it("after the era, the same row is a role change: the job stays org A's", async () => {
    db.users["tech-a"] = { ...member };
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        createdAt: new Date("2026-04-28T00:00:00Z"),
        usedAt: new Date("2026-05-01T00:00:00Z"),
        acceptanceProvider: "credentials",
      },
      instant("2026-10-05T00:00:00Z"),
    ];
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBe(
      "owner-a",
    );
  });

  it("a marked row inside the era is still a role change", async () => {
    db.users["tech-a"] = { ...member };
    db.invites = [
      {
        organizationId: "org-a",
        acceptedUserId: "tech-a",
        email: "tech-a@example.com",
        createdAt: new Date("2026-04-28T00:00:00Z"),
        usedAt: new Date("2026-05-01T00:00:00Z"),
        acceptanceProvider: "credentials",
      },
      {
        ...instant("2026-07-01T00:00:00Z"),
        acceptanceProvider: "role-change-audit",
      },
    ];
    await expect(getResourceTenantOwner("tech-a", CREATED)).resolves.toBe(
      "owner-a",
    );
  });
});
