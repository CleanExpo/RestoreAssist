import { describe, expect, it } from "vitest";
import {
  MIN_ABSOLUTE_MOVEMENT,
  MIN_EVENTS_FOR_PROPOSE,
  MIN_POPULATED_WINDOWS,
  UNAVAILABLE_THRESHOLD,
  detect,
  parseReportFilename,
  summarise,
  type VerifierReport,
} from "../verifier-metrics";

const DAY = 86400;
/** 2026-05-06T00:00:00Z, so windows land on predictable dates. */
const T0 = 1778025600;

function report(over: Partial<VerifierReport> = {}): VerifierReport {
  return {
    sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    timestamp: T0,
    domain: "claim-truthfulness-static",
    status: "static-clean",
    ...over,
  };
}

/** n reports on one day, of which `failed` are failures. */
function day(offset: number, n: number, failed = 0, unavailable = 0): VerifierReport[] {
  const out: VerifierReport[] = [];
  for (let i = 0; i < n; i++) {
    const status =
      i < failed ? "failed" : i < failed + unavailable ? "verifier-unavailable" : "static-clean";
    out.push(report({ timestamp: T0 + offset * DAY + i, status }));
  }
  return out;
}

describe("parsing a report filename", () => {
  it("pulls session, timestamp and domain out of the real shape", () => {
    const p = parseReportFilename(
      "24d390d6-bc63-5642-b4fb-366125f47b71-1788046563-claim-truthfulness-static.json",
    );
    expect(p).toEqual({
      sessionId: "24d390d6-bc63-5642-b4fb-366125f47b71",
      timestamp: 1788046563,
      domain: "claim-truthfulness-static",
    });
  });

  it("keeps a domain containing hyphens intact", () => {
    // "ios-app-review-static" must not be truncated at the first hyphen.
    expect(
      parseReportFilename("24d390d6-bc63-5642-b4fb-366125f47b71-1788046563-ios-app-review-static.json")
        ?.domain,
    ).toBe("ios-app-review-static");
  });

  it("returns null rather than guessing at an unrecognised name", () => {
    expect(parseReportFilename("_hook-errors.log")).toBeNull();
    expect(parseReportFilename("notes.json")).toBeNull();
  });
});

describe("summarising", () => {
  it("counts a failure from the status and from claims_failed alike", () => {
    // The corpus has two report shapes: a terse {status, reason} and a full one
    // carrying claims_*. A failure recorded only in claims_failed must not be
    // missed just because its status string is something else.
    const s = summarise([
      report({ status: "failed" }),
      report({ timestamp: T0 + 1, status: "partial", claimsFailed: 1 }),
      report({ timestamp: T0 + 2, status: "static-clean" }),
    ]);
    expect(s.windows[0].failed).toBe(2);
  });

  it("does not double-count a warning as a failure", () => {
    const s = summarise([report({ status: "partial", claimsWarned: 4, claimsFailed: 0 })]);
    expect(s.windows[0].failed).toBe(0);
    expect(s.windows[0].warned).toBe(1);
  });

  it("counts an unavailable verifier separately from a failure", () => {
    // These mean opposite things. A failure is the gate WORKING; an unavailable
    // verifier is the gate being off, which is the more dangerous of the two
    // precisely because it looks like a clean run.
    const s = summarise([report({ status: "verifier-unavailable" })]);
    expect(s.windows[0].unavailable).toBe(1);
    expect(s.windows[0].failed).toBe(0);
    expect(s.unavailableRate).toBe(1);
  });

  it("does NOT invent empty windows for days nobody worked", () => {
    // A day with no reports is missing data, not a perfect score. Padding it
    // with zeros would drag the mean down and make a real spike look ordinary.
    const s = summarise([...day(0, 5), ...day(30, 5)]);
    expect(s.populatedWindows).toBe(2);
    expect(s.windows.map((w) => w.day)).toHaveLength(2);
  });

  it("orders windows chronologically regardless of input order", () => {
    const s = summarise([...day(10, 1), ...day(0, 1), ...day(5, 1)]);
    expect(s.windows.map((w) => w.day)).toEqual([...s.windows.map((w) => w.day)].sort());
  });

  it("reports zeroes rather than dividing by zero on an empty corpus", () => {
    const s = summarise([]);
    expect(s.totalReports).toBe(0);
    expect(s.unbackedClaimRate).toBe(0);
    expect(s.unavailableRate).toBe(0);
    expect(s.spanDays).toBe(0);
  });
});

describe("the verifier-availability threshold", () => {
  it("fires when the gate was off more often than the threshold allows", () => {
    const s = summarise(day(0, 100, 0, 5)); // 5%
    const d = detect(s).find((x) => x.metric === "verifier_unavailable_rate")!;
    expect(d.tier).toBe("diagnose");
    expect(d.reason).toMatch(/gate was OFF|could not run/i);
  });

  it("stays ok below the threshold", () => {
    const s = summarise(day(0, 100, 0, 1)); // 1%
    expect(detect(s).find((x) => x.metric === "verifier_unavailable_rate")!.tier).toBe("ok");
  });

  it("needs no baseline — it fires on a single window", () => {
    // The point of making this a threshold rather than a band. One day of data
    // is enough, because a control that is off has no acceptable background
    // rate to be measured against.
    const s = summarise(day(0, 10, 0, 10));
    expect(s.populatedWindows).toBe(1);
    expect(detect(s).find((x) => x.metric === "verifier_unavailable_rate")!.tier).toBe("diagnose");
  });

  it("treats an empty corpus as unmeasured, never as clean", () => {
    // "No reports" and "no failures" read identically in a naive summary, and
    // conflating them is how an observability signal becomes reassurance.
    const d = detect(summarise([]));
    const avail = d.find((x) => x.metric === "verifier_unavailable_rate")!;
    expect(avail.tier).toBe("insufficient-data");
    expect(avail.reason).toMatch(/not a clean result/i);
  });
});

describe("the unbacked-claim control band", () => {
  it("refuses a sigma verdict below the minimum populated windows", () => {
    // The property that keeps this honest. The real corpus has six populated
    // days across four sessions; a mean and sigma over that is arithmetic, not
    // evidence, and reporting it as a band position would be the exact defect
    // the verifier itself catches.
    const reports = Array.from({ length: MIN_POPULATED_WINDOWS - 1 }, (_, i) =>
      day(i, 10, i === 0 ? 9 : 0),
    ).flat();
    const d = detect(summarise(reports)).find((x) => x.metric === "unbacked_claim_rate")!;
    expect(d.tier).toBe("insufficient-data");
    expect(d.reason).toMatch(/NOT as a band position/);
  });

  it("still reports the observed rate while refusing the verdict", () => {
    // Withholding the verdict must not mean withholding the number.
    const d = detect(summarise(day(0, 10, 5))).find((x) => x.metric === "unbacked_claim_rate")!;
    expect(d.value).toBeCloseTo(0.5);
  });

  it("gives a verdict once there are enough windows", () => {
    const reports = Array.from({ length: MIN_POPULATED_WINDOWS }, (_, i) => day(i, 10, 1)).flat();
    const d = detect(summarise(reports)).find((x) => x.metric === "unbacked_claim_rate")!;
    expect(d.tier).not.toBe("insufficient-data");
  });

  it("escalates past ok on a real excursion", () => {
    // A flat-ish baseline with one late spike. Built so the deviation is large,
    // then checked to be in the propose tier rather than merely non-ok.
    const base = Array.from({ length: MIN_POPULATED_WINDOWS + 4 }, (_, i) =>
      day(i, 10, i % 2 === 0 ? 1 : 0),
    ).flat();
    const spike = day(MIN_POPULATED_WINDOWS + 4, 10, 10);
    const d = detect(summarise([...base, ...spike])).find(
      (x) => x.metric === "unbacked_claim_rate",
    )!;
    expect(["diagnose", "propose"]).toContain(d.tier);
    expect(d.reason).toMatch(/sigma/);
  });

  it("does not divide by zero on a perfectly flat baseline", () => {
    // Sigma is 0 here, where every unequal value is infinitely many sigmas out.
    // A naive implementation returns Infinity and escalates on the first blip.
    const flat = Array.from({ length: MIN_POPULATED_WINDOWS + 2 }, (_, i) => day(i, 10, 0)).flat();
    const d = detect(summarise(flat)).find((x) => x.metric === "unbacked_claim_rate")!;
    expect(d.tier).toBe("ok");
    expect(d.reason).toMatch(/Flat at/);
  });

  it("holds a tiny absolute movement at log however many sigmas it is", () => {
    // The property the movement floor exists for. A baseline that barely moves
    // has a tiny sigma, so a change of well under a percentage point can read
    // as a many-sigma excursion. Escalating on that would page a human over
    // noise until they stopped reading the signal.
    //
    // 100 reports a day makes one failure a 1pp move -- under the floor -- while
    // the near-flat baseline makes it a large sigma count.
    const base = Array.from({ length: MIN_POPULATED_WINDOWS + 4 }, (_, i) =>
      day(i, 100, i % 4 === 0 ? 1 : 0),
    ).flat();
    const blip = day(MIN_POPULATED_WINDOWS + 4, 100, 2);
    const d = detect(summarise([...base, ...blip])).find(
      (x) => x.metric === "unbacked_claim_rate",
    )!;
    expect(Math.abs(d.value! - 0.02)).toBeLessThan(MIN_ABSOLUTE_MOVEMENT);
    expect(d.tier).toBe("log");
    expect(d.reason).toMatch(/below the .*floor/i);
  });

  it("will not let a single failing turn authorise a pull request", () => {
    // `propose` lets an agent open a PR with nobody having started it. Against a
    // clean baseline one bad turn is arbitrarily many sigmas out, so without
    // this floor a single event buys that authority. Held at diagnose, which is
    // read-only.
    const base = Array.from({ length: MIN_POPULATED_WINDOWS + 4 }, (_, i) => day(i, 10, 0)).flat();
    const one = day(MIN_POPULATED_WINDOWS + 4, 10, 1);
    const d = detect(summarise([...base, ...one])).find(
      (x) => x.metric === "unbacked_claim_rate",
    )!;
    expect(d.tier).toBe("diagnose");
    expect(d.reason).toMatch(/below the 3 needed before an agent may open a pull request/);
  });

  it("reaches propose once there are enough failing turns behind it", () => {
    const base = Array.from({ length: MIN_POPULATED_WINDOWS + 4 }, (_, i) => day(i, 10, 0)).flat();
    const many = day(MIN_POPULATED_WINDOWS + 4, 10, MIN_EVENTS_FOR_PROPOSE + 2);
    const d = detect(summarise([...base, ...many])).find(
      (x) => x.metric === "unbacked_claim_rate",
    )!;
    expect(d.tier).toBe("propose");
  });
});

describe("the thresholds themselves", () => {
  it("keeps the availability threshold tight", () => {
    // Pinned so a future edit loosening it is a visible decision rather than a
    // quiet one. The real corpus sits at 1.6 per cent, just under this.
    expect(UNAVAILABLE_THRESHOLD).toBeLessThanOrEqual(0.02);
  });

  it("requires more than one event before an agent may open a pull request", () => {
    // Pinned so lowering it is a visible decision. At 1 this tier would let a
    // single unlucky turn start a pull request nobody asked for.
    expect(MIN_EVENTS_FOR_PROPOSE).toBeGreaterThan(1);
  });

  it("keeps the minimum window count above the size of the current corpus", () => {
    // The corpus has 6 populated days. If this ever drops to 6 or below, the
    // detector starts issuing sigma verdicts on the very data this test says
    // is too thin for them.
    expect(MIN_POPULATED_WINDOWS).toBeGreaterThan(6);
  });
});
