import { describe, expect, it } from "vitest";
import {
  MIN_CONFIDENCE,
  mergePanel,
  renderVerdict,
  type Finding,
  type SeatResult,
} from "../panel";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    dimension: 2,
    severity: "critical",
    confidence: 90,
    file: "app/api/jobs/route.ts",
    line: 14,
    summary: "The route has no getServerSession check.",
    failure_scenario: "An unauthenticated GET returns every job in the workspace.",
    ...over,
  };
}

function seat(id: string, family: string, findings: Finding[]): SeatResult {
  return { seat: id, family, findings };
}

describe("review panel — counting votes by family", () => {
  // The property the whole panel rests on. Two checkpoints of one base model
  // make the same mistakes, so their agreement is not corroboration. If this
  // ever passes with families.length === 1, the panel has become an echo
  // chamber that reports its own single opinion as consensus.
  it("does not treat two seats of the SAME family as corroboration", () => {
    const verdict = mergePanel([
      seat("nemotron-super", "nemotron", [finding()]),
      seat("nemotron-ultra", "nemotron", [finding()]),
    ]);

    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].seats).toEqual(["nemotron-super", "nemotron-ultra"]);
    expect(verdict.findings[0].families).toEqual(["nemotron"]);
    expect(verdict.findings[0].corroborated).toBe(false);
  });

  it("treats two seats of DIFFERENT families as corroboration", () => {
    const verdict = mergePanel([
      seat("nemotron-super", "nemotron", [finding()]),
      seat("gemma", "gemma", [finding()]),
    ]);

    expect(verdict.findings[0].families.sort()).toEqual(["gemma", "nemotron"]);
    expect(verdict.findings[0].corroborated).toBe(true);
    expect(verdict.needsAdjudication).toBe(false);
  });

  it("calls a lone-family Critical contested, and asks for a tie-break", () => {
    const verdict = mergePanel([
      seat("nemotron-super", "nemotron", [finding()]),
      seat("gemma", "gemma", []),
    ]);

    expect(verdict.contestedCritical).toHaveLength(1);
    expect(verdict.needsAdjudication).toBe(true);
  });

  it("does not ask for a tie-break over a lone-family Important", () => {
    // Only Critical is worth paying to settle. An Important finding from one
    // family is reported as what it is and left to the reviewer.
    const verdict = mergePanel([
      seat("nemotron-super", "nemotron", [finding({ severity: "important" })]),
      seat("gemma", "gemma", []),
    ]);

    expect(verdict.needsAdjudication).toBe(false);
    expect(verdict.findings[0].corroborated).toBe(false);
  });
});

describe("review panel — severity is never averaged away", () => {
  it("keeps the HIGHEST severity any seat assigned", () => {
    // A panel that downgrades a security finding because two of three seats
    // called it a nit is worse than no panel: it manufactures reassurance.
    const verdict = mergePanel([
      seat("nemotron-super", "nemotron", [finding({ severity: "suggestion", confidence: 80 })]),
      seat("gemma", "gemma", [finding({ severity: "critical", confidence: 78 })]),
      seat("openai", "openai", [finding({ severity: "suggestion", confidence: 76 })]),
    ]);

    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].severity).toBe("critical");
    expect(verdict.findings[0].confidence).toBe(80);
  });
});

describe("review panel — the confidence floor from REVIEW.md", () => {
  it("drops a finding below the floor", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ confidence: MIN_CONFIDENCE - 1 })]),
      seat("nemotron-super", "nemotron", []),
    ]);
    expect(verdict.findings).toHaveLength(0);
  });

  it("keeps a finding exactly at the floor", () => {
    // The boundary, asserted explicitly: a `>` where the spec says `>=` would
    // silently drop every finding that landed on the line.
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ confidence: MIN_CONFIDENCE })]),
      seat("nemotron-super", "nemotron", []),
    ]);
    expect(verdict.findings).toHaveLength(1);
  });

  it("does not let a low-confidence duplicate corroborate a high-confidence one", () => {
    // The dropped finding must not sneak back in as a second family's vote.
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ confidence: 90 })]),
      seat("nemotron-super", "nemotron", [finding({ confidence: 40 })]),
    ]);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].families).toEqual(["gemma"]);
    expect(verdict.findings[0].corroborated).toBe(false);
  });
});

describe("review panel — deciding two seats mean the same defect", () => {
  it("merges findings a few lines apart", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ line: 14 })]),
      seat("nemotron-super", "nemotron", [finding({ line: 19 })]),
    ]);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].corroborated).toBe(true);
  });

  it("keeps findings far apart in the same file separate", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ line: 14 })]),
      seat("nemotron-super", "nemotron", [finding({ line: 400 })]),
    ]);
    expect(verdict.findings).toHaveLength(2);
  });

  it("does not merge different dimensions at the same line", () => {
    // Two different defects can sit on one line. Merging them would hide one.
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ dimension: 2 })]),
      seat("nemotron-super", "nemotron", [finding({ dimension: 7 })]),
    ]);
    expect(verdict.findings).toHaveLength(2);
  });

  it("treats ./path and path as the same file", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ file: "./app/api/jobs/route.ts" })]),
      seat("nemotron-super", "nemotron", [finding({ file: "app/api/jobs/route.ts" })]),
    ]);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].corroborated).toBe(true);
  });

  it("merges on dimension and file when a seat gave no line", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding({ line: undefined })]),
      seat("nemotron-super", "nemotron", [finding({ line: 14 })]),
    ]);
    expect(verdict.findings).toHaveLength(1);
  });
});

describe("review panel — a failed seat is absent, not agreement", () => {
  it("reports the failure and does not count it as a family", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding()]),
      { seat: "nemotron-super", family: "nemotron", findings: [], error: "HTTP 429" },
    ]);

    expect(verdict.failedSeats).toEqual(["nemotron-super"]);
    expect(verdict.respondingFamilies).toEqual(["gemma"]);
    // One family responded, so nothing can be corroborated. The panel must say
    // it is degraded rather than presenting one opinion as a panel verdict.
    expect(verdict.degraded).toBe(true);
  });

  it("does not raise a tie-break nobody could settle when degraded", () => {
    // With one family there is no disagreement to adjudicate — every finding
    // would be "contested" by construction, and paying to adjudicate all of
    // them would be the most expensive way to learn nothing.
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding()]),
      { seat: "nemotron-super", family: "nemotron", findings: [], error: "timeout" },
    ]);

    expect(verdict.degraded).toBe(true);
    expect(verdict.contestedCritical).toHaveLength(0);
    expect(verdict.needsAdjudication).toBe(false);
  });

  it("is degraded when every seat fails", () => {
    const verdict = mergePanel([
      { seat: "gemma", family: "gemma", findings: [], error: "HTTP 500" },
      { seat: "nemotron-super", family: "nemotron", findings: [], error: "HTTP 500" },
    ]);
    expect(verdict.degraded).toBe(true);
    expect(verdict.findings).toHaveLength(0);
  });
});

describe("review panel — ordering", () => {
  it("puts Critical first, then corroborated, then confidence", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [
        finding({ dimension: 9, severity: "suggestion", file: "a.tsx", confidence: 99 }),
        finding({ dimension: 3, severity: "important", file: "b.ts", confidence: 80 }),
        finding({ dimension: 2, severity: "critical", file: "c.ts", confidence: 76 }),
      ]),
      seat("nemotron-super", "nemotron", [
        finding({ dimension: 2, severity: "critical", file: "c.ts", confidence: 76 }),
      ]),
    ]);

    expect(verdict.findings.map((f) => f.severity)).toEqual([
      "critical",
      "important",
      "suggestion",
    ]);
  });
});

describe("review panel — the rendered comment states its basis", () => {
  it("distinguishes a corroborated finding from a lone one", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding()]),
      seat("nemotron-super", "nemotron", [finding()]),
      seat("openai", "openai", [finding({ dimension: 3, severity: "important", file: "z.ts" })]),
    ]);
    const body = renderVerdict(verdict);

    expect(body).toContain("2 families agree");
    expect(body).toContain("1 family only — not corroborated");
  });

  it("says so loudly when the panel is degraded", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding()]),
      { seat: "nemotron-super", family: "nemotron", findings: [], error: "HTTP 429" },
    ]);
    const body = renderVerdict(verdict);

    expect(body).toContain("Degraded run");
    expect(body).toContain("nemotron-super");
    expect(body).toContain("A seat that failed is absent, not agreement");
  });

  it("does not let a clean degraded run read as a clean bill of health", () => {
    // "No findings" from one model is not the same claim as "no findings from
    // three independent families", and the comment must not blur them.
    const verdict = mergePanel([
      seat("gemma", "gemma", []),
      { seat: "nemotron-super", family: "nemotron", findings: [], error: "HTTP 429" },
    ]);
    const body = renderVerdict(verdict);

    expect(body).toContain("weak evidence");
  });

  it("flags unadjudicated contested Criticals as unconfirmed", () => {
    const verdict = mergePanel([
      seat("gemma", "gemma", [finding()]),
      seat("nemotron-super", "nemotron", []),
      seat("openai", "openai", []),
    ]);
    const body = renderVerdict(verdict, { adjudicated: false });

    expect(body).toContain("unconfirmed leads");
  });

  it("always says the panel cannot approve or block", () => {
    const body = renderVerdict(mergePanel([seat("gemma", "gemma", []), seat("n", "nemotron", [])]));
    expect(body).toContain("does not approve, block, or push");
  });
});
