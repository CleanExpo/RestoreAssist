// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildGantt } from "@/lib/report-experience/visuals/gantt";
import { buildMoistureSeries } from "@/lib/report-experience/visuals/moisture";
import { prioritiseHazards } from "@/lib/report-experience/visuals/hazards";
import { planComparison, type ComparisonFrame } from "@/lib/report-experience/visuals/comparison";
import { ReportGantt } from "../ReportGantt";
import { MoistureTrends } from "../MoistureTrends";
import { HazardCards } from "../HazardCards";
import { ComparisonSlider } from "../ComparisonSlider";

const TZ = "Australia/Brisbane";

// Synthetic demo data only: no real claim, person or address.
const gantt = buildGantt({
  timeZone: TZ,
  now: "2026-03-10T10:00:00+10:00",
  plan: {
    revision: "plan-1",
    createdAt: "2026-03-01T00:00:00+10:00",
    tasks: [
      { id: "t1", label: "Extraction", start: "2026-03-02", end: "2026-03-03", status: "complete" },
      { id: "t2", label: "Drying", start: "2026-03-03", end: "2026-03-07", status: "in-progress" },
    ],
  },
  current: {
    revision: "plan-2",
    createdAt: "2026-03-05T09:00:00+10:00",
    tasks: [
      { id: "t1", label: "Extraction", start: "2026-03-02", end: "2026-03-03", status: "complete" },
      { id: "t2", label: "Drying", start: "2026-03-03", end: "2026-03-09", status: "in-progress" },
      { id: "t3", label: "Insurer approval", start: null, end: null },
    ],
  },
});

const series = buildMoistureSeries(
  [
    { id: "r1", roomId: "kitchen", observedAt: "2026-03-02T09:00:00+10:00", value: 30, unit: "WME" },
    { id: "r2", roomId: "kitchen", observedAt: "2026-03-03T09:00:00+10:00", value: 29.6, unit: "WME" },
    { id: "r3", roomId: "kitchen", observedAt: "2026-03-05T09:00:00+10:00", value: 29.4, unit: "WME" },
    { id: "r4", roomId: "kitchen", observedAt: "2026-03-02T09:00:00+10:00", value: 11.2, unit: "G_PER_KG" },
  ],
  { timeZone: TZ, targets: { WME: 16 }, roomLabels: { kitchen: "Kitchen" } },
);

const hazards = prioritiseHazards([
  { id: "h1", title: "Possible live wiring under water", action: "Isolate the circuit and have an electrician inspect", verification: "unverified", severity: "critical", position: { x: 0.4, y: 0.6 } },
  { id: "h2", title: "Slippery floor", action: "Place signage", verification: "verified", severity: "low" },
]);

const frame = (over: Partial<ComparisonFrame>): ComparisonFrame => ({
  photoId: "p", stage: "before", url: "/photos/p", alt: "Kitchen floor", roomId: "kitchen",
  capturedAt: "2026-03-02T09:14:00+10:00", source: "inspection-photo", ...over,
});
const before = frame({});
const after = frame({ photoId: "q", stage: "after", url: "/photos/q", capturedAt: "2026-03-09T15:00:00+10:00" });

afterEach(() => cleanup());

describe("static markup (what the PDF and a no-JavaScript reader get)", () => {
  it("shows the critical danger alert and the action in plain text", () => {
    const html = renderToStaticMarkup(<HazardCards model={hazards} />);
    expect(html).toContain("CRITICAL DANGER");
    expect(html).toContain("Possible live wiring under water");
    expect(html).toContain("Isolate the circuit");
    expect(html).toContain("not recorded") ; // h2 has no position
  });

  it("does not call an empty hazard list safe", () => {
    const html = renderToStaticMarkup(<HazardCards model={prioritiseHazards([])} />);
    expect(html).toContain("not a safety clearance");
    expect(html).not.toContain("CRITICAL DANGER");
  });

  it("gantt carries the full table with changes and the no-date task", () => {
    const html = renderToStaticMarkup(<ReportGantt model={gantt} />);
    expect(html).toContain("<table");
    expect(html).toContain("Duration changed");
    expect(html).toContain("No date recorded");
    expect(html).toContain("past end date");
    expect(html).toContain("Current revision plan-2 compared with plan revision plan-1");
  });

  it("moisture trend gives a table, a stall flag and states that no dry date can be given", () => {
    const html = renderToStaticMarkup(<MoistureTrends series={series} />);
    expect(html).toContain("<table");
    expect(html).toContain("No dry date can be stated");
    expect(html).toContain("Drying may have stalled");
    expect(html).toContain("No reading recorded on 4 Mar 2026");
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    // The air reading is shown without any dry claim.
    expect(html).toContain("has no dry target");
  });

  it("moisture table shows the recorded time so two same-day readings can be told apart", () => {
    const two = buildMoistureSeries(
      [
        { id: "m1", roomId: "kitchen", observedAt: "2026-03-02T09:00:00+10:00", value: 30, unit: "WME" },
        { id: "m2", roomId: "kitchen", observedAt: "2026-03-02T17:00:00+10:00", value: 28, unit: "WME" },
      ],
      { timeZone: TZ, targets: { WME: 16 }, roomLabels: { kitchen: "Kitchen" } },
    );
    const html = renderToStaticMarkup(<MoistureTrends series={two} />);
    expect(html).toMatch(/9:00/);
    expect(html).toMatch(/5:00/);
  });

  it("moisture trend with no readings states there is nothing to show", () => {
    expect(renderToStaticMarkup(<MoistureTrends series={[]} />)).toContain("no dry date can be shown");
  });

  it("comparison always carries both labelled frames, even when the slider is offered", () => {
    const plan = planComparison(before, after, TZ);
    expect(plan.mode).toBe("slider");
    const html = renderToStaticMarkup(<ComparisonSlider plan={plan} before={before} after={after} />);
    expect(html.match(/<figcaption>/g)).toHaveLength(2);
    expect(html).toContain("inspection photo");
  });

  it("comparison without provenance withholds the slider and says why", () => {
    const thin = frame({ capturedAt: null });
    const plan = planComparison(thin, after, TZ);
    const html = renderToStaticMarkup(<ComparisonSlider plan={plan} before={thin} after={after} />);
    expect(html).not.toContain('type="range"');
    expect(html).toContain("Slider comparison withheld");
    expect(html).toContain("no recorded capture time");
  });
});

describe("interaction and motion", () => {
  beforeAll(() => {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it("motion is off by default and can be played and paused", () => {
    render(<ReportGantt model={gantt} />);
    const root = screen.getByTestId("report-gantt");
    expect(root.getAttribute("data-motion")).toBe("off");
    fireEvent.click(screen.getByRole("button", { name: "Play motion" }));
    expect(root.getAttribute("data-motion")).toBe("on");
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(root.getAttribute("data-motion")).toBe("off");
  });

  it("reduced motion disables the control and leaves motion off", () => {
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    render(<ReportGantt model={gantt} />);
    const button = screen.getByRole("button", { name: "Play motion" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("report-gantt").getAttribute("data-motion")).toBe("off");
    expect(screen.getByText(/reduced motion/i)).toBeTruthy();
  });

  it("the slider moves the reveal and exposes a readable value", () => {
    const plan = planComparison(before, after, TZ);
    render(<ComparisonSlider plan={plan} before={before} after={after} />);
    const range = screen.getByRole("slider") as HTMLInputElement;
    fireEvent.change(range, { target: { value: "70" } });
    expect(range.getAttribute("aria-valuetext")).toBe("70 percent before photo");
  });
});

describe("chart colour rule", () => {
  it("the visuals carry no colour literal; colour comes from the chart tokens", () => {
    const dirs = [join(__dirname, ".."), join(__dirname, "..", "..", "..", "..", "lib", "report-experience", "visuals")];
    const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => join(d, f)));
    expect(files.length).toBeGreaterThanOrEqual(9);
    const literal = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/;
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(literal);
  });
});
