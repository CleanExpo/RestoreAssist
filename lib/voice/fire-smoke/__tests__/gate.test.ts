import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { checkFireSubmitGate, type FireDb } from "../server";
import { computeWalkthroughStatus, evaluateFireGate } from "../status";
import { FIRE_SECTION_IDS } from "../checklist";
import { allFilled, entry, lastAt, resetClock, signoff } from "./helpers";
import type { FireObservationRow } from "../schema";

function dbWith(
  rows: FireObservationRow[],
  sessionIds: string[] = ["s1"],
): FireDb & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    voiceCopilotObservation: {
      async findMany(args: unknown) {
        calls.push(args);
        return rows.map((r, i) => ({ ...r, sessionId: sessionIds[i % sessionIds.length] }));
      },
    },
  };
}

let warn: MockInstance;
beforeEach(() => {
  resetClock();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const CLAIM_SPELLINGS = ["FIRE", "fire", "FIRE_SMOKE", "HVAC", null];

describe("checkFireSubmitGate", () => {
  it.each(CLAIM_SPELLINGS)("refuses a started, unsigned walkthrough (claimType %s)", async (claimType) => {
    const result = await checkFireSubmitGate({ id: "insp-1", claimType }, dbWith([entry("structure")]));
    expect(result.blocked).toBe(true);
    expect(result.status).toBe(422);
    expect(result.body?.code).toBe("SECTIONS_OPEN");
    expect(result.body?.openSectionIds).toContain("safety_brief");
  });

  it.each(CLAIM_SPELLINGS)("refuses a walkthrough changed after sign-off (claimType %s)", async (claimType) => {
    const rows = allFilled();
    const result = await checkFireSubmitGate(
      { id: "insp-1", claimType },
      dbWith([...rows, signoff(lastAt(rows)), entry("contents")]),
    );
    expect(result.blocked).toBe(true);
    expect(result.body?.code).toBe("CHANGED_AFTER_SIGNOFF");
  });

  it("refuses a complete but unsigned walkthrough", async () => {
    const result = await checkFireSubmitGate({ id: "insp-1", claimType: "FIRE" }, dbWith(allFilled()));
    expect(result.blocked).toBe(true);
    expect(result.body?.code).toBe("UNSIGNED");
  });

  it("passes a signed walkthrough even after claimType was overwritten", async () => {
    const rows = allFilled();
    const result = await checkFireSubmitGate(
      { id: "insp-1", claimType: "HVAC" },
      dbWith([...rows, signoff(lastAt(rows))], ["s1", "s2"]),
    );
    expect(result.blocked).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[fire-walkthrough-gate]",
      expect.objectContaining({ inspectionId: "insp-1", outcome: "signed", sessionCount: 2, openSections: 0 }),
    );
  });

  it("passes a fire claim with no walkthrough and logs no_walkthrough", async () => {
    const result = await checkFireSubmitGate({ id: "insp-9", claimType: "FIRE" }, dbWith([]));
    expect(result.blocked).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[fire-walkthrough-gate]",
      expect.objectContaining({ inspectionId: "insp-9", outcome: "no_walkthrough" }),
    );
  });

  it("stays silent for a water job with no walkthrough", async () => {
    const result = await checkFireSubmitGate({ id: "insp-2", claimType: "WATER" }, dbWith([]));
    expect(result.blocked).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads every session of the job: no endedAt or expiresAt filter", async () => {
    const db = dbWith([]);
    await checkFireSubmitGate({ id: "insp-3", claimType: "FIRE" }, db);
    const args = db.calls[0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({
      type: {
        in: [
          "fire_notice_acknowledged",
          "fire_section_entry",
          "fire_section_na",
          "fire_walkthrough_signoff",
        ],
      },
      session: { inspectionId: "insp-3" },
    });
  });
});

describe("evaluateFireGate", () => {
  it("never-started passes, started-unsigned refuses", () => {
    expect(evaluateFireGate(computeWalkthroughStatus(FIRE_SECTION_IDS, [])).canSubmit).toBe(true);
    expect(
      evaluateFireGate(computeWalkthroughStatus(FIRE_SECTION_IDS, [entry("structure")])).outcome,
    ).toBe("refused_unsigned");
  });
});
