// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// jsdom has no layout, so ResponsiveContainer would draw nothing. Give the
// chart a fixed size so its goal lines render.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 800, height: 300 }}>
        {isValidElement(children)
          ? cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
              width: 800,
              height: 300,
            })
          : children}
      </div>
    ),
  };
});

import MoistureTrendChart from "@/components/inspection/MoistureTrendChart";
import DryingProgressChart from "@/components/inspection/DryingProgressChart";
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas";
import { DRYING_GOAL_BASIS_SHORT, STATUS_COLORS } from "@/lib/iicrc-dry-standards";

afterEach(cleanup);

// RA-8509. Timber guide: dry at 19%. The job's reference reading from
// unaffected timber in the same building: 12%. A 14% timber reading is at or
// below the guide but still above the job's own drying goal.
const REFERENCES = { timber: 12 };

const trendReadings = [
  { id: "t1", location: "Hall floor", surfaceType: "timber", moistureLevel: 22, recordedAt: "2026-11-18T09:00:00Z" },
  { id: "t2", location: "Hall floor", surfaceType: "timber", moistureLevel: 14, recordedAt: "2026-11-20T09:00:00Z" },
];

describe("MoistureTrendChart (RA-8509)", () => {
  it("judges the latest reading against the reference reading and draws the reference line", () => {
    const { container } = render(
      <MoistureTrendChart readings={trendReadings} references={REFERENCES} />,
    );
    expect(screen.getByText(/1 location above\s+their drying goal/)).toBeInTheDocument();
    expect(screen.getByText("Caution")).toBeInTheDocument();
    expect(screen.queryByText(/At or below guide/)).not.toBeInTheDocument();
    expect(container.textContent).toContain("Reference timber ≤12%");
    expect(container.textContent).not.toContain("Guide ≤19%");
  });

  it("clean twin: with no reference reading it keeps the guide line and wording", () => {
    const { container } = render(<MoistureTrendChart readings={trendReadings} />);
    expect(screen.getByText(/At or below guide/)).toBeInTheDocument();
    expect(container.textContent).toContain("Guide ≤19%");
    expect(container.textContent).not.toContain("Reference timber");
  });
});

const progressReadings = [
  { id: "p1", location: "Hall floor", surfaceType: "timber", moistureLevel: 22, depth: "Surface", recordedAt: "2026-11-18T09:00:00Z" },
  { id: "p2", location: "Hall floor", surfaceType: "timber", moistureLevel: 14, depth: "Surface", recordedAt: "2026-11-20T09:00:00Z" },
];

describe("DryingProgressChart (RA-8509)", () => {
  it("uses the reference reading for the target, status and goal line", () => {
    const { container } = render(
      <DryingProgressChart readings={progressReadings} references={REFERENCES} />,
    );
    const row = screen.getByRole("row", { name: /Hall floor/ });
    expect(row).toHaveTextContent("≤12%");
    expect(row).toHaveTextContent("(reference)");
    expect(row).toHaveTextContent("Drying");
    expect(container.textContent).toContain("Reference timber ≤12%");
    expect(container.textContent).not.toContain("Guide ≤19%");
  });

  it("clean twin: with no reference reading it shows the guide target and line", () => {
    const { container } = render(<DryingProgressChart readings={progressReadings} />);
    const row = screen.getByRole("row", { name: /Hall floor/ });
    expect(row).toHaveTextContent("≤19%");
    expect(row).toHaveTextContent("(guide)");
    expect(row).toHaveTextContent("Dry");
    expect(container.textContent).toContain("Guide ≤19%");
  });
});

const mapReadings = [
  { id: "m1", location: "Hall floor", surfaceType: "timber", moistureLevel: 14, depth: "Surface", notes: null },
];

function readingBadge() {
  return screen.getByText("14%", { selector: "span" });
}

describe("MoistureMappingCanvas (RA-8509)", () => {
  it("colours a reading against its material's reference reading", () => {
    render(<MoistureMappingCanvas readings={mapReadings} references={REFERENCES} />);
    expect(readingBadge()).toHaveStyle({ backgroundColor: STATUS_COLORS.drying.dot });
    expect(screen.getByText(DRYING_GOAL_BASIS_SHORT)).toBeInTheDocument();
  });

  it("labels the selected reading against the reference", () => {
    render(
      <MoistureMappingCanvas
        readings={mapReadings}
        references={REFERENCES}
        initialPoints={[{ id: "m1", x: 100, y: 100, reading: mapReadings[0] }]}
      />,
    );
    fireEvent.click(screen.getByTestId("moisture-marker-m1"));
    expect(screen.getByText("Drying (above reference 12%)")).toBeInTheDocument();
  });

  it("clean twin: with no reference reading it colours and labels against the guide", () => {
    render(
      <MoistureMappingCanvas
        readings={mapReadings}
        initialPoints={[{ id: "m1", x: 100, y: 100, reading: mapReadings[0] }]}
      />,
    );
    fireEvent.click(screen.getByTestId("moisture-marker-m1"));
    expect(screen.getByText("Dry (guide ≤19%)")).toBeInTheDocument();
    expect(screen.queryByText(DRYING_GOAL_BASIS_SHORT)).not.toBeInTheDocument();
  });
});
