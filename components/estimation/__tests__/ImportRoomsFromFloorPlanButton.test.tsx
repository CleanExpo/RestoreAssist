// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImportRoomsFromFloorPlanButton } from "../ImportRoomsFromFloorPlanButton";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from "react-hot-toast";

const FLOOR_M2 = 9;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("ImportRoomsFromFloorPlanButton — RA-7608", () => {
  it("creates an estimate with a 9 m² room line from a 3 m × 3 m sketch", async () => {
    const postBodies: Array<{
      lineItems?: Array<{ qty?: number; unit?: string }>;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/sketches/estimate")) {
          return {
            ok: true,
            json: async () => ({
              estimate: {
                lineItems: [
                  {
                    id: "room-Ground Floor-1",
                    category: "room",
                    description: "Bedroom — Ground Floor",
                    quantity: FLOOR_M2,
                    unit: "m²",
                    areaM2: FLOOR_M2,
                    notes: "Floor area",
                    provenance: "operator_measured",
                  },
                ],
                totalRoomAreaM2: FLOOR_M2,
                totalDamageAreaM2: 0,
                extractedAt: new Date().toISOString(),
              },
            }),
          };
        }
        if (String(url).includes("/api/estimates") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          postBodies.push(body);
          return {
            ok: true,
            json: async () => ({ id: "est_1", lineItems: body.lineItems }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const onImported = vi.fn();
    render(
      <ImportRoomsFromFloorPlanButton
        inspectionId="insp_1"
        reportId="rep_1"
        onImported={onImported}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Import rooms from floor plan" }),
    );

    await waitFor(() => expect(postBodies).toHaveLength(1));
    const nine = postBodies[0].lineItems?.find(
      (li) => li.qty === FLOOR_M2 && li.unit === "m²",
    );
    expect(nine, "POST body must contain a 9 m² room line").toBeDefined();
    expect(onImported).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Imported measured rooms from the floor plan",
    );
  });

  it("does not POST when the sketch room is not operator_measured", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/sketches/estimate")) {
        return {
          ok: true,
          json: async () => ({
            estimate: {
              lineItems: [
                {
                  id: "room-1",
                  category: "room",
                  description: "AI Room — Ground Floor",
                  quantity: 100,
                  unit: "m²",
                  provenance: "ai_suggested",
                },
              ],
              totalRoomAreaM2: 100,
              totalDamageAreaM2: 0,
              extractedAt: new Date().toISOString(),
            },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ImportRoomsFromFloorPlanButton
        inspectionId="insp_1"
        reportId="rep_1"
        onImported={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Import rooms from floor plan" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No measured rooms on the floor plan",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
