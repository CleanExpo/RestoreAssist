import { describe, it, expect, vi } from "vitest";
import {
  buildWorkContext,
  WORK_HINT,
  STANDARDS_HINT,
  ASSISTANT_SYSTEM_PROMPT,
  type WorkContextClient,
} from "../grounding";

function stub(opts: { inspections?: unknown[]; reports?: unknown[] }) {
  const inspFind = vi.fn(async () => opts.inspections ?? []);
  const repFind = vi.fn(async () => opts.reports ?? []);
  const client = {
    inspection: { findMany: inspFind },
    report: { findMany: repFind },
  } as unknown as WorkContextClient;
  return { client, inspFind, repFind };
}

const INSP = {
  inspectionNumber: "NIR-2026-07-0042",
  propertyAddress: "14 Harbour View Tce, Manly NSW",
  status: "SCOPED",
  createdAt: new Date("2026-07-04T00:00:00Z"),
};

describe("buildWorkContext — tenancy + formatting", () => {
  it("queries strictly by the caller's userId (tenant boundary)", async () => {
    const { client, inspFind, repFind } = stub({ inspections: [INSP] });
    await buildWorkContext(client, "user_a");
    expect(inspFind.mock.calls[0][0].where).toEqual({ userId: "user_a" });
    expect(repFind.mock.calls[0][0].where).toEqual({ userId: "user_a" });
    // bounded reads
    expect(inspFind.mock.calls[0][0].take).toBe(5);
    expect(repFind.mock.calls[0][0].take).toBe(5);
  });

  it("returns a compact summary of the caller's own records", async () => {
    const { client } = stub({
      inspections: [INSP],
      reports: [
        { title: "S500 Water Report", status: "FINAL", createdAt: new Date("2026-07-01T00:00:00Z") },
      ],
    });
    const out = await buildWorkContext(client, "user_a");
    expect(out).toContain("YOUR RECENT WORK");
    expect(out).toContain("NIR-2026-07-0042");
    expect(out).toContain("04/07/2026"); // AU date format
    expect(out).toContain("S500 Water Report");
  });

  it("returns empty string when the caller has no records", async () => {
    const { client } = stub({});
    expect(await buildWorkContext(client, "user_a")).toBe("");
  });

  it("returns empty string (never throws) for a blank userId", async () => {
    const { client, inspFind } = stub({});
    expect(await buildWorkContext(client, "")).toBe("");
    expect(inspFind).not.toHaveBeenCalled();
  });

  it("returns empty string when the query throws (best-effort, never breaks chat)", async () => {
    const client = {
      inspection: { findMany: vi.fn(async () => { throw new Error("db down"); }) },
      report: { findMany: vi.fn(async () => []) },
    } as unknown as WorkContextClient;
    expect(await buildWorkContext(client, "user_a")).toBe("");
  });
});

describe("WORK_HINT gating", () => {
  it.each([
    "show me my recent inspections",
    "how many jobs do I have",
    "what's my latest report",
    "list my open claims",
  ])("fires on work question: %s", (q) => {
    expect(WORK_HINT.test(q)).toBe(true);
  });

  it.each([
    "what does S500 say about category 3 water",
    "what is my hourly charge out rate",
    "how do I set up drying equipment",
  ])("does NOT fire on non-work question: %s", (q) => {
    expect(WORK_HINT.test(q)).toBe(false);
  });
});

describe("assistant persona + standards hint sanity", () => {
  it("persona is de-hardwired (no founder identity) and read-only", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain("Phill");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("READ-ONLY");
  });
  it("standards hint matches restoration terms", () => {
    expect(STANDARDS_HINT.test("what does IICRC S500 require")).toBe(true);
    expect(STANDARDS_HINT.test("hello there")).toBe(false);
  });
});
