// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EnvironmentalSummary from "@/components/inspection/EnvironmentalSummary";

afterEach(() => cleanup());

// RA-7713 part 9: GET /api/inspections/[id] returns environmentalData as an
// ARRAY (EnvironmentalData[] since RA-1383 made it a time series). Job
// NIR-2026-09-F1C142 showed "Temperature °C · Humidity % · Dew Point N/A°C ·
// Air Circulation No" while its row held 22 / 65 / 15 / true.
const apiShape = [
  {
    id: "env-1",
    ambientTemperature: 22,
    humidityLevel: 65,
    dewPoint: 15,
    airCirculation: true,
    weatherConditions: null,
    notes: null,
    recordedAt: "2026-09-22T01:00:00.000Z",
  },
];

describe("EnvironmentalSummary (RA-7713 part 9)", () => {
  it("renders the values the API actually returns (array shape)", () => {
    render(<EnvironmentalSummary environmentalData={apiShape} />);
    expect(screen.getByTestId("env-temperature")).toHaveTextContent("22°C");
    expect(screen.getByTestId("env-humidity")).toHaveTextContent("65%");
    expect(screen.getByTestId("env-dew-point")).toHaveTextContent("15.0°C");
    expect(screen.getByTestId("env-air-circulation")).toHaveTextContent("Yes");
  });

  it("shows the most recent reading when several exist", () => {
    render(
      <EnvironmentalSummary
        environmentalData={[
          { ...apiShape[0], id: "old", ambientTemperature: 30, recordedAt: "2026-09-20T01:00:00.000Z" },
          apiShape[0],
        ]}
      />,
    );
    expect(screen.getByTestId("env-temperature")).toHaveTextContent("22°C");
  });

  it("shows an em dash only for null values, never a bare unit", () => {
    render(
      <EnvironmentalSummary
        environmentalData={[{ ...apiShape[0], dewPoint: null }]}
      />,
    );
    expect(screen.getByTestId("env-dew-point")).toHaveTextContent(/^—$/);
    expect(screen.getByTestId("env-temperature")).toHaveTextContent("22°C");
  });

  it("still accepts the single-object shape (demo inspection)", () => {
    render(<EnvironmentalSummary environmentalData={apiShape[0]} />);
    expect(screen.getByTestId("env-humidity")).toHaveTextContent("65%");
  });

  it("renders nothing for an empty array", () => {
    const { container } = render(
      <EnvironmentalSummary environmentalData={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
