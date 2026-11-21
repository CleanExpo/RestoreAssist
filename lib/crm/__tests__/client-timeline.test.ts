import { describe, expect, it } from "vitest";
import { MAX_TIMELINE_EVENTS, buildClientTimeline } from "../client-timeline";

const job = (id: string, created: string, completed: string | null = null) => ({
  id,
  inspectionNumber: `NIR-${id}`,
  propertyAddress: "1 Harbour St",
  claimType: "FIRE",
  createdAt: new Date(created),
  completedAt: completed ? new Date(completed) : null,
});

describe("buildClientTimeline", () => {
  it("leaves out suppressed emails and emails for other jobs", () => {
    const ev = buildClientTimeline(
      [job("a", "2026-01-01")],
      [
        { inspectionId: "a", createdAt: new Date("2026-01-02"), status: "SUPPRESSED", eventType: "STEP_TRANSITION" },
        { inspectionId: "zzz", createdAt: new Date("2026-01-03"), status: "SENT", eventType: "STEP_TRANSITION" },
      ],
    );
    expect(ev.map((e) => e.kind)).toEqual(["job_opened"]);
  });

  it("orders newest first across jobs and caps the length", () => {
    const jobs = Array.from({ length: 80 }, (_, n) => job(String(n), `2026-01-01T00:00:${String(n % 60).padStart(2, "0")}Z`, "2026-06-01"));
    const ev = buildClientTimeline(jobs, []);
    expect(ev).toHaveLength(MAX_TIMELINE_EVENTS);
    for (let k = 1; k < ev.length; k++) expect(ev[k - 1].at >= ev[k].at).toBe(true);
  });

  it("labels an unknown claim type as restoration", () => {
    expect(buildClientTimeline([{ ...job("a", "2026-01-01"), claimType: null }], [])[0].title).toMatch(/^Restoration job/);
  });
});
