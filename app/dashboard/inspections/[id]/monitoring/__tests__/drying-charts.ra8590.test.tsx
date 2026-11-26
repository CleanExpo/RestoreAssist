// @vitest-environment jsdom
/**
 * RA-8590 — the drying charts must be reachable from a job screen. RA-266,
 * RA-305 and RA-8509 built and tested MoistureTrendChart and
 * DryingProgressChart in isolation, but no screen imported them. This test
 * renders the Monitoring page (not the charts alone) and fails if either
 * chart is removed from it, or stops receiving the job's reference readings
 * from the monitoring report.
 */
import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/inspection/MeterPhotoCapture", () => ({
  MeterPhotoCapture: () => null,
}));

type ChartProps = {
  readings: Array<{ id: string; unit?: string | null }>;
  references?: Record<string, number>;
};
const charts = vi.hoisted(() => ({
  trend: [] as ChartProps[],
  progress: [] as ChartProps[],
}));
vi.mock("@/components/inspection/MoistureTrendChart", () => ({
  default: (props: ChartProps) => {
    charts.trend.push(props);
    return <div data-testid="moisture-trend-chart" />;
  },
}));
vi.mock("@/components/inspection/DryingProgressChart", () => ({
  default: (props: ChartProps) => {
    charts.progress.push(props);
    return <div data-testid="drying-progress-chart" />;
  },
}));

import MonitoringPage from "../page";

const snapshot = (id: string, moistureLevel: number, recordedAt: string) => ({
  id,
  location: "Lounge",
  surfaceType: "timber",
  moistureLevel,
  depth: "Surface",
  unit: "%MC",
  target: 12.5,
  aboveTarget: moistureLevel > 12.5,
  notes: null,
  recordedAt,
});

const log = (date: string, readings: ReturnType<typeof snapshot>[]) => ({
  date,
  readings,
  readingCount: readings.length,
  avgMoisture: readings[0].moistureLevel,
  maxMoisture: readings[0].moistureLevel,
  aboveTargetCount: readings.filter((r) => r.aboveTarget).length,
  dryingStatus: "PROGRESSING",
  statusReason: "test",
});

const REFERENCES = { timber: 12.5 };

function reportWith(dailyLogs: unknown[]) {
  return {
    inspectionId: "job-1",
    inspectionNumber: "NIR-1",
    propertyAddress: "1 Test St",
    technicianName: null,
    inspectionDate: "2026-11-01T00:00:00.000Z",
    iicrcReference: "Drying goal",
    affectedAreas: [],
    totalDaysMonitored: dailyLogs.length,
    currentAvgMoisture: null,
    overallDryingStatus: "PROGRESSING",
    dailyLogs,
    references: REFERENCES,
  };
}

let report: ReturnType<typeof reportWith>;

beforeEach(() => {
  charts.trend.length = 0;
  charts.progress.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ report }),
    })) as unknown as typeof fetch,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage() {
  const params = Promise.resolve({ id: "job-1" });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <MonitoringPage params={params} />
      </Suspense>,
    );
  });
  await screen.findByText("Daily Drying Monitoring Report");
}

describe("Monitoring page drying charts (RA-8590)", () => {
  it("shows the trend chart and the progress chart with the job's reference readings", async () => {
    report = reportWith([
      log("2026-11-01", [snapshot("d1", 24, "2026-11-01T09:00:00.000Z")]),
      log("2026-11-02", [snapshot("d2", 18, "2026-11-02T09:00:00.000Z")]),
    ]);
    await renderPage();

    expect(screen.getByTestId("moisture-trend-chart")).toBeTruthy();
    expect(screen.getByTestId("drying-progress-chart")).toBeTruthy();

    for (const props of [charts.trend.at(-1), charts.progress.at(-1)]) {
      expect(props?.references).toEqual(REFERENCES);
      expect(props?.readings.map((r) => r.id)).toEqual(["d1", "d2"]);
      expect(props?.readings.every((r) => r.unit === "%MC")).toBe(true);
    }
  });

  it("shows no chart before any reading is recorded", async () => {
    report = reportWith([]);
    await renderPage();

    expect(screen.queryByTestId("moisture-trend-chart")).toBeNull();
    expect(screen.queryByTestId("drying-progress-chart")).toBeNull();
    expect(screen.getByText("No moisture readings yet")).toBeTruthy();
  });
});
