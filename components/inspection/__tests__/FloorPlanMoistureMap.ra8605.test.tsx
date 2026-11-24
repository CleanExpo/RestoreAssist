// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import FloorPlanMoistureMap from "@/components/inspection/FloorPlanMoistureMap";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// RA-8605: the job page drew the pins on a blank grid because it never passed
// the inspection's saved floor plan, and its "Upload Floor Plan" button kept
// the picture in the browser only. One wrapper now owns both for every mount.
const readings = [
  {
    id: "r1",
    location: "Kitchen wall",
    surfaceType: "drywall",
    moistureLevel: 42,
    depth: "Surface",
    notes: null,
  },
];

const SAVED = "https://res.cloudinary.com/demo/image/upload/floor-plan.png";

function backgroundHref(container: HTMLElement): string | null {
  return container.querySelector("svg image")?.getAttribute("href") ?? null;
}

describe("RA-8605 FloorPlanMoistureMap", () => {
  it("draws the inspection's saved floor plan picture behind the pins", () => {
    const { container } = render(
      <FloorPlanMoistureMap
        readings={readings}
        floorPlanImageUrl={SAVED}
        resolveInspectionId={() => "insp-1"}
      />,
    );
    expect(backgroundHref(container)).toBe(SAVED);
  });

  it("uploads a chosen picture to the inspection's floor-plan route and reports the saved URL", async () => {
    const stored = "https://res.cloudinary.com/demo/image/upload/new.png";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ imageUrl: stored }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();

    const { container } = render(
      <FloorPlanMoistureMap
        readings={readings}
        floorPlanImageUrl={null}
        resolveInspectionId={async () => "insp-1"}
        onFloorPlanSaved={onSaved}
      />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "plan.png", {
      type: "image/png",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(stored));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/inspections/insp-1/floor-plan");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(backgroundHref(container)).toBe(stored);
  });

  it("does not show a picture the server refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Invalid file type" }), {
          status: 400,
        }),
      ),
    );
    const onSaved = vi.fn();
    const { container } = render(
      <FloorPlanMoistureMap
        readings={readings}
        floorPlanImageUrl={null}
        resolveInspectionId={() => "insp-1"}
        onFloorPlanSaved={onSaved}
      />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "plan.png", { type: "image/png" })] },
    });
    await waitFor(() =>
      expect(container.querySelector("label")?.textContent).toContain(
        "Upload Floor Plan",
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(backgroundHref(container)).toBeNull();
  });
});
