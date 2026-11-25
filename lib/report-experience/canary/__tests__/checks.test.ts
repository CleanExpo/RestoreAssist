import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { standardCite } from "@/lib/nir-standards-mapping";
import {
  centsForms,
  findAxeViolations,
  findMoneyLeaks,
  findOverflow,
  findPrintProblems,
  findUncitedStandards,
  findUnguardedMotion,
  hasSentinelPrice,
} from "../checks";
import { CANARY_SENTINEL_CENTS } from "../scenario";

const root = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// Each block below shows the check passing on good input, then FAILING on a planted fault.

describe("money: a technician page never carries the price", () => {
  const clean = { markup: "<p>No financial estimate is shown in this preview.</p>", text: "No financial estimate is shown in this preview." };

  it("passes a page with no price", () => {
    expect(findMoneyLeaks(clean, CANARY_SENTINEL_CENTS)).toEqual([]);
  });

  it("fails when the formatted price is visible (planted)", () => {
    const planted = { markup: "<p>$76,543.21</p>", text: "Estimate $76,543.21" };
    expect(findMoneyLeaks(planted, CANARY_SENTINEL_CENTS).length).toBeGreaterThan(0);
  });

  it("fails when the price is only in the sent data, not on screen (planted)", () => {
    const planted = { markup: '<script>{"estimatedTotalCents":7654321}</script>', text: clean.text };
    const found = findMoneyLeaks(planted, CANARY_SENTINEL_CENTS);
    expect(found.some((f) => f.detail.includes("7654321"))).toBe(true);
  });

  it("fails on any currency text even when it is not the sentinel (planted)", () => {
    expect(findMoneyLeaks({ markup: "<p>x</p>", text: "Total AUD 12" }, CANARY_SENTINEL_CENTS).length).toBeGreaterThan(0);
    expect(findMoneyLeaks({ markup: "<p>x</p>", text: "Total $12" }, CANARY_SENTINEL_CENTS).length).toBeGreaterThan(0);
  });

  it("does not take the framework's own $-references for money", () => {
    const rsc = { markup: '<script>self.__next_f.push([1,"$L1","$undefined"])</script>', text: "Hazards and readings" };
    expect(findMoneyLeaks(rsc, CANARY_SENTINEL_CENTS)).toEqual([]);
  });

  it("an empty page is a finding, not a pass", () => {
    expect(findMoneyLeaks({ markup: "", text: "" }, CANARY_SENTINEL_CENTS).length).toBe(1);
  });

  it("positive control: the probe sees the price when it is there", () => {
    expect(hasSentinelPrice({ markup: "", text: "$76,543.21" }, CANARY_SENTINEL_CENTS)).toBe(true);
    expect(hasSentinelPrice(clean, CANARY_SENTINEL_CENTS)).toBe(false);
    expect(centsForms(CANARY_SENTINEL_CENTS)).toContain("$76,543.21");
  });
});

describe("citations: every standard named comes from standardCite()", () => {
  it("passes what standardCite prints, with and without a section", () => {
    expect(findUncitedStandards(`Aligned to IICRC ${standardCite("S500")}`)).toEqual([]);
    expect(findUncitedStandards(`See ${standardCite("S500", "10.5")} and ${standardCite("S520")}.`)).toEqual([]);
  });

  it("fails a hand-typed stale year (planted)", () => {
    expect(findUncitedStandards("Aligned to IICRC S500:2015").length).toBe(1); // standards-cite-ignore: planted stale year
  });

  it("fails a bare standard with no edition (planted)", () => {
    expect(findUncitedStandards("Follows IICRC S500 throughout").length).toBe(1);
  });

  it("fails a hand-typed section with the wrong year (planted)", () => {
    expect(findUncitedStandards("S500:2099 §7.1").length).toBe(1); // standards-cite-ignore: planted wrong year
  });

  it("ignores ids and hashes that only look similar", () => {
    expect(findUncitedStandards("SAMPLE-001 ab12S500cd rev-C4 RA-2026-0457")).toEqual([]);
  });
});

describe("reduced motion: every animated selector has a reduce branch", () => {
  const studio = read("components/report-experience/ReportDesignStudio.module.css");
  const visuals = read("components/report-experience/visuals/visuals.module.css");

  it("passes the real stylesheets", () => {
    expect(findUnguardedMotion(studio)).toEqual([]);
    expect(findUnguardedMotion(visuals)).toEqual([]);
  });

  it("fails when the reduce branch is removed (planted)", () => {
    const planted = studio.replace(/@media \(prefers-reduced-motion: reduce\)[^\n]*\n/, "");
    expect(planted).not.toBe(studio);
    const found = findUnguardedMotion(planted);
    expect(found.map((f) => f.detail).join("\n")).toMatch(/\.ganttMotion|\.animatedStroke|\.themeButton/);
  });

  it("fails when only one of two animated selectors is calmed (planted)", () => {
    const css = ".a { animation: spin 1s; } .b { transition: opacity .2s; } @media (prefers-reduced-motion: reduce) { .a { animation: none; } }";
    expect(findUnguardedMotion(css).map((f) => f.detail)).toEqual([".b animates with no prefers-reduced-motion branch"]);
  });

  it("a reduce branch that does not calm anything does not count (planted)", () => {
    const css = ".a { animation: spin 1s; } @media (prefers-reduced-motion: reduce) { .a { color: red; } }";
    expect(findUnguardedMotion(css).length).toBe(1);
  });

  it("a print-only or width-only media block is not a reduce branch (planted)", () => {
    const css = ".a { animation: spin 1s; } @media print { .a { animation: none; } }";
    expect(findUnguardedMotion(css).length).toBe(1);
  });
});

describe("print: light page, dark ink", () => {
  it("passes white and navy", () => {
    expect(findPrintProblems({ background: "rgb(255, 255, 255)", ink: "rgb(11, 31, 58)" })).toEqual([]);
  });

  it("fails the dark theme leaking into print (planted)", () => {
    expect(findPrintProblems({ background: "rgb(10, 25, 47)", ink: "rgb(255, 255, 255)" }).length).toBeGreaterThan(0);
  });

  it("fails weak contrast on a light page (planted)", () => {
    expect(findPrintProblems({ background: "rgb(255, 255, 255)", ink: "rgb(170, 170, 170)" }).length).toBe(1);
  });

  it("colours it cannot read are a finding, not a pass", () => {
    expect(findPrintProblems({ background: "color(srgb 1 1 1)", ink: "rgb(0, 0, 0)" }).length).toBe(1);
  });
});

describe("overflow and axe", () => {
  it("overflow", () => {
    expect(findOverflow({ scrollWidth: 390, clientWidth: 390 })).toEqual([]);
    expect(findOverflow({ scrollWidth: 1200, clientWidth: 390 }).length).toBe(1);
    expect(findOverflow({ scrollWidth: 0, clientWidth: 0 }).length).toBe(1);
  });

  it("axe: serious and critical fail, minor passes, no result fails", () => {
    const v = (impact: string) => ({ violations: [{ id: "image-alt", impact, nodes: [{ target: ["img"] }] }] });
    expect(findAxeViolations({ violations: [] })).toEqual([]);
    expect(findAxeViolations(v("minor"))).toEqual([]);
    expect(findAxeViolations(v("critical")).length).toBe(1);
    expect(findAxeViolations(v("serious")).length).toBe(1);
    expect(findAxeViolations(undefined).length).toBe(1);
  });
});
