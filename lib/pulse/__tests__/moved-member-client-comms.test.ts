/**
 * RA-7893 review P1-MOVED-JOB-CLIENT-COMMS-NEW-OWNER — both Pulse senders
 * read CLIENT_COMMS for the business the JOB belongs to.
 *
 * tech-a created insp_a in org A on 1 June, then left and accepted an invite
 * into org B on 1 July. Only org B holds CLIENT_COMMS. Neither the status
 * dispatcher nor the review-ask may email insp_a's client on org B's add-on.
 *
 * The real entitlement and organisation resolvers run against an in-memory
 * prisma fake; only the network sender and error reporter are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientStatusFeed } from "@/lib/portal/client-status-feed";

const sendPulseUpdateEmail = vi.fn();

const db = vi.hoisted(() => ({
  job: {
    userId: "tech-a",
    createdAt: new Date("2026-06-01T00:00:00Z"),
  },
  users: {} as Record<
    string,
    { id: string; role: string; organizationId: string | null; email: string }
  >,
  orgOwners: { "org-a": "owner-a", "org-b": "owner-b" } as Record<
    string,
    string
  >,
  invites: [] as Array<{
    organizationId: string;
    acceptedUserId: string;
    usedAt: Date;
  }>,
  entitledWorkspaces: [] as string[],
  logs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: async () => ({
        id: "insp_a",
        userId: db.job.userId,
        createdAt: db.job.createdAt,
        inspectionNumber: "NIR-2026-06-0001",
        pulseEnabled: true,
        report: {
          client: {
            email: "home@owner.test",
            pulseOptOut: false,
            portalAccounts: [{ token: "tok_a", inspectionId: null, createdAt: new Date() }],
          },
        },
        workspace: {
          name: "A Restorations",
          owner: {
            organization: {
              name: "A Restorations Pty Ltd",
              tradingName: null,
              googleReviewUrl: "https://g.page/r/a-restorations/review",
            },
          },
        },
      }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users[where.id];
        if (!u) return null;
        return {
          ...u,
          organization: u.organizationId
            ? { ownerId: db.orgOwners[u.organizationId] }
            : null,
        };
      },
    },
    userInvite: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          OR: Array<{ acceptedUserId?: string | null }>;
        };
      }) => {
        const userId = where.OR[0].acceptedUserId;
        const latest = db.invites
          .filter(
            (i) =>
              i.organizationId === where.organizationId &&
              i.acceptedUserId === userId,
          )
          .sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime())[0];
        return latest ? { usedAt: latest.usedAt } : null;
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
    workspaceMember: { findFirst: async () => null },
    featureEntitlement: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_sku: { workspaceId: string; sku: string } };
      }) =>
        where.workspaceId_sku.sku === "CLIENT_COMMS" &&
        db.entitledWorkspaces.includes(where.workspaceId_sku.workspaceId)
          ? { id: "fe", active: true }
          : null,
    },
    clientCommsLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.logs.push(data);
        return { id: `log_${db.logs.length}` };
      },
      update: async () => ({}),
    },
  },
}));

vi.mock("@/lib/email", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendPulseUpdateEmail: (...args: unknown[]) => sendPulseUpdateEmail(...args),
  };
});
vi.mock("@/lib/email/resolve-platform-config", async (importActual) => ({
  ...(await importActual<
    typeof import("@/lib/email/resolve-platform-config")
  >()),
  isEmailServiceConfigured: () => true,
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { dispatchPulseNotification } from "../dispatcher";
import { dispatchReviewAskNotification } from "../review-ask";

const STEP_EVENT = {
  type: "STEP_TRANSITION" as const,
  feed: buildClientStatusFeed({
    status: "SCOPED",
    workflow: null,
    reportStatus: null,
    pendingApprovals: [],
  }),
};

beforeEach(() => {
  sendPulseUpdateEmail.mockReset().mockResolvedValue("mailtrap_msg_1");
  process.env.MAILTRAP_API_KEY = "mt_test";
  process.env.SENDER_EMAIL = "updates@restoreassist.app";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  db.logs = [];
  db.job = { userId: "tech-a", createdAt: new Date("2026-06-01T00:00:00Z") };
  // tech-a joined org A on 1 May, created insp_a on 1 June, then moved to
  // org B on 1 July. Only org B holds CLIENT_COMMS.
  db.users = {
    "tech-a": {
      id: "tech-a",
      role: "USER",
      organizationId: "org-b",
      email: "tech-a@example.com",
    },
  };
  db.invites = [
    {
      organizationId: "org-a",
      acceptedUserId: "tech-a",
      usedAt: new Date("2026-05-01T00:00:00Z"),
    },
    {
      organizationId: "org-b",
      acceptedUserId: "tech-a",
      usedAt: new Date("2026-07-01T00:00:00Z"),
    },
  ];
  db.entitledWorkspaces = ["ws-b"];
});

describe("Pulse status dispatcher — moved technician (RA-7893)", () => {
  it("does not email an org A job's client on org B's CLIENT_COMMS", async () => {
    const result = await dispatchPulseNotification({
      inspectionId: "insp_a",
      event: STEP_EVENT,
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "NOT_ENTITLED",
    });
  });

  it("still sends for a job the technician created after joining org B", async () => {
    db.job.createdAt = new Date("2026-07-02T00:00:00Z");
    const result = await dispatchPulseNotification({
      inspectionId: "insp_a",
      event: STEP_EVENT,
    });
    expect(result.status).toBe("SENT");
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
  });
});

describe("Pulse review-ask — moved technician (RA-7893)", () => {
  it("does not send the review-ask for an org A job on org B's CLIENT_COMMS", async () => {
    const result = await dispatchReviewAskNotification("insp_a");
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "NOT_ENTITLED",
    });
  });

  it("still sends for a job the technician created after joining org B", async () => {
    db.job.createdAt = new Date("2026-07-02T00:00:00Z");
    const result = await dispatchReviewAskNotification("insp_a");
    expect(result.status).toBe("SENT");
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
  });
});
