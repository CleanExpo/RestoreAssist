/**
 * Lazy expiry must not overwrite a trial that was extended after it read the user
 * (product-readiness FT-R2). checkAndUpdateTrialStatus reads the user, sees an
 * expired trial, then writes EXPIRED. If a founding-trial grant commits a new
 * 60-day trialEndsAt between that read and write, the grant must survive.
 *
 * The fake database applies a write only when its `where` still matches the
 * current row, exactly as Postgres would. A write that does not re-check the
 * trial it read overwrites the grant; a conditional one does not.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { subscriptionStatus: string; trialEndsAt: Date; creditsRemaining: number };
const db = vi.hoisted(() => ({ row: null as unknown as Row, onRead: () => {} }));

function matches(row: Row, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, v]) => {
    if (k === "id") return true;
    const cur = (row as Record<string, unknown>)[k];
    if (v instanceof Date) return cur instanceof Date && cur.getTime() === v.getTime();
    if (v && typeof v === "object") {
      const op = v as { lt?: Date; lte?: Date; equals?: unknown };
      if (op.lt) return (cur as Date).getTime() < op.lt.getTime();
      if (op.lte) return (cur as Date).getTime() <= op.lte.getTime();
      if ("equals" in op) return cur === op.equals;
    }
    return cur === v;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => {
        const snapshot = { ...db.row };
        db.onRead();
        return snapshot;
      }),
      update: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        Object.assign(db.row, data);
        return db.row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        if (!matches(db.row, where)) return { count: 0 };
        Object.assign(db.row, data);
        return { count: 1 };
      }),
    },
  },
}));

import { checkAndUpdateTrialStatus } from "@/lib/trial-handling";

const DAY = 24 * 60 * 60 * 1000;

describe("checkAndUpdateTrialStatus vs a concurrent founding grant", () => {
  beforeEach(() => {
    db.row = {
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date(Date.now() - DAY),
      creditsRemaining: 3,
    };
    db.onRead = () => {};
  });

  it("keeps a 60-day grant that commits after the expiry check read the user", async () => {
    const granted = new Date(Date.now() + 60 * DAY);
    db.onRead = () => {
      db.row.trialEndsAt = granted;
      db.row.creditsRemaining = 10;
    };
    const expired = await checkAndUpdateTrialStatus("u1");
    expect(db.row.subscriptionStatus).toBe("TRIAL");
    expect(db.row.trialEndsAt.getTime()).toBe(granted.getTime());
    expect(db.row.creditsRemaining).toBe(10);
    expect(expired).toBe(false);
  });

  it("still expires a lapsed trial when nothing changed it", async () => {
    const expired = await checkAndUpdateTrialStatus("u1");
    expect(expired).toBe(true);
    expect(db.row.subscriptionStatus).toBe("EXPIRED");
    expect(db.row.creditsRemaining).toBe(0);
  });
});
