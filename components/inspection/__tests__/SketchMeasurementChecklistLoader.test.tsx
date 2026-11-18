// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SketchMeasurementChecklistLoader } from "../SketchMeasurementChecklistLoader";

beforeEach(() => vi.restoreAllMocks());

describe("SketchMeasurementChecklistLoader", () => {
  it("loads rooms from status API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            measurementRooms: [
              {
                id: "r1",
                label: "Bed",
                floorLabel: "Ground",
                reason: "ai_suggested",
              },
            ],
          },
        }),
      }),
    );
    render(<SketchMeasurementChecklistLoader inspectionId="i1" />);
    await waitFor(() =>
      expect(screen.getByRole("region")).toHaveTextContent(/Bed/),
    );
  });
});
