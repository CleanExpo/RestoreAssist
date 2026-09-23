// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas";
import {
  pointsFromReadings,
  saveReadingPlacement,
} from "@/lib/moisture/moisture-map-placement";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// RA-7713 part 12: on NIR-2026-09-F1C142 four readings sat in "Unplaced
// readings", dragging did nothing, the map stayed empty and Export PNG stayed
// disabled. The job page mounted the canvas with no saved positions and no
// way to save one.
const readings = [
  {
    id: "r1",
    location: "Kitchen wall",
    surfaceType: "drywall",
    moistureLevel: 42,
    depth: "Surface",
    notes: null,
  },
  {
    id: "r2",
    location: "Hall floor",
    surfaceType: "timber",
    moistureLevel: 18,
    depth: "Surface",
    notes: null,
  },
];

function svgWithRect() {
  const svg = screen.getByRole("img", { name: /moisture mapping canvas/i });
  // jsdom has no layout; give the canvas an 800x600 box at the origin.
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return svg;
}

describe("MoistureMappingCanvas placement (RA-7713 part 12)", () => {
  it("click-to-place reports normalised coordinates and renders the marker", async () => {
    const onPlaceReading = vi.fn().mockResolvedValue(undefined);
    render(
      <MoistureMappingCanvas readings={readings} onPlaceReading={onPlaceReading} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Kitchen wall/ }));
    fireEvent.click(svgWithRect(), { clientX: 200, clientY: 300 });

    await waitFor(() =>
      expect(onPlaceReading).toHaveBeenCalledWith("r1", {
        mapX: 0.25,
        mapY: 0.5,
      }),
    );
    expect(screen.getByTestId("moisture-marker-r1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Export PNG/i }),
    ).not.toBeDisabled();
  });

  it("dragging a reading onto the grid places it", async () => {
    const onPlaceReading = vi.fn().mockResolvedValue(undefined);
    render(
      <MoistureMappingCanvas readings={readings} onPlaceReading={onPlaceReading} />,
    );
    const store: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => {
        store[k] = v;
      },
      getData: (k: string) => store[k] ?? "",
      effectAllowed: "move",
      dropEffect: "move",
    };
    fireEvent.dragStart(screen.getByRole("button", { name: /Hall floor/ }), {
      dataTransfer,
    });
    const svg = svgWithRect();
    fireEvent.dragOver(svg, { dataTransfer });
    // jsdom has no DragEvent, so clientX/Y are not taken from the init dict.
    const drop = createEvent.drop(svg, { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: 400 });
    Object.defineProperty(drop, "clientY", { value: 150 });
    fireEvent(svg, drop);

    await waitFor(() =>
      expect(onPlaceReading).toHaveBeenCalledWith("r2", {
        mapX: 0.5,
        mapY: 0.25,
      }),
    );
    expect(screen.getByTestId("moisture-marker-r2")).toBeInTheDocument();
  });

  it("puts the reading back and says so when saving fails", async () => {
    const onPlaceReading = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    render(
      <MoistureMappingCanvas readings={readings} onPlaceReading={onPlaceReading} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Kitchen wall/ }));
    await act(async () => {
      fireEvent.click(svgWithRect(), { clientX: 200, clientY: 300 });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not save/i),
    );
    expect(screen.queryByTestId("moisture-marker-r1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Kitchen wall/ }),
    ).toBeInTheDocument();
  });

  it("ignores a drop with no usable coordinates instead of clearing a position", () => {
    const onPlaceReading = vi.fn();
    render(
      <MoistureMappingCanvas readings={readings} onPlaceReading={onPlaceReading} />,
    );
    const dataTransfer = { getData: () => "r2", setData: () => {} };
    fireEvent.drop(svgWithRect(), { dataTransfer });
    expect(onPlaceReading).not.toHaveBeenCalled();
  });

  it("renders saved positions as markers on load", () => {
    const placed = [{ ...readings[0], mapX: 0.5, mapY: 0.5 }, readings[1]];
    render(
      <MoistureMappingCanvas
        readings={placed}
        initialPoints={pointsFromReadings(placed)}
      />,
    );
    expect(screen.getByTestId("moisture-marker-r1")).toBeInTheDocument();
    expect(screen.queryByTestId("moisture-marker-r2")).not.toBeInTheDocument();
  });

  it("replaces the empty map with an instruction", () => {
    render(<MoistureMappingCanvas readings={readings} />);
    expect(
      screen.getByText(/select a reading on the right, then click the grid/i),
    ).toBeInTheDocument();
  });

  it("placing a reading on the job page calls the API with its coordinates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reading: { id: "r1", mapX: 0.25, mapY: 0.5 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MoistureMappingCanvas
        readings={readings}
        onPlaceReading={(id, pos) => saveReadingPlacement("insp-1", id, pos)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Kitchen wall/ }));
    fireEvent.click(svgWithRect(), { clientX: 200, clientY: 300 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/inspections/insp-1/moisture/r1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ mapX: 0.25, mapY: 0.5 });
    expect(screen.getByTestId("moisture-marker-r1")).toBeInTheDocument();
  });
});
