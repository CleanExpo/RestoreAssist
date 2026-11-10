// @vitest-environment jsdom
/**
 * RA-8281 B1 review round 8: with no price list loaded (the fetch failed or is
 * still loading) the equipment screen stored a daily rate of 0 on new
 * selections, and the rate reader accepted that cached 0, so the total read
 * $0.00 and Save posted equipmentCostTotal 0. With no price list the current
 * rate is unknown: the total is not shown and Save refuses, whatever rate a
 * selection carries.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}));

import EquipmentToolsSelection from "../EquipmentToolsSelection";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function equipmentPosts() {
  return fetchMock.mock.calls.filter(([url, init]) =>
    String(url).includes("/equipment") && (init as RequestInit | undefined)?.method === "POST",
  );
}

async function saveWith(dailyRate: number | undefined, priceList: "failed" | "loaded") {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/api/pricing-config")) {
      return priceList === "failed"
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, json: async () => ({ pricingConfig: { dehumidifierLGRDailyRate: 70 } }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  render(
    <EquipmentToolsSelection
      reportId="r1"
      initialData={{ equipmentSelection: [{ groupId: "lgr-85", quantity: 1, dailyRate }] }}
    />,
  );
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/pricing-config"),
  );
  fireEvent.click(screen.getByText("Next: Scope Areas"));
  fireEvent.click(screen.getByText("Next: Select Equipment"));
  fireEvent.click(screen.getByText("Save & Complete"));
}

describe("equipment screen with no price list (RA-8281 B1 review)", () => {
  it("a selection carrying a cached 0 is never saved at $0 when the price list failed to load", async () => {
    await saveWith(0, "failed");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/not set/i);
    expect(equipmentPosts()).toHaveLength(0);
  });

  it("a selection with no cached rate is never saved when the price list failed to load", async () => {
    await saveWith(undefined, "failed");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(equipmentPosts()).toHaveLength(0);
  });

  it("control: with the price list loaded, Save posts the price-list total", async () => {
    await saveWith(0, "loaded");
    await waitFor(() => expect(equipmentPosts()).toHaveLength(1));
    const body = JSON.parse(String((equipmentPosts()[0][1] as RequestInit).body));
    expect(body.equipmentCostTotal).toBeGreaterThan(0);
    expect(toastError).not.toHaveBeenCalled();
  });
});

// RA-8281 B1 round 13: saved lines reach the editor through the one reader.
// A saved entry that cannot be read is not loaded, so it cannot crash the
// screen or ride along into the next save.
describe("equipment screen loading saved lines (RA-8281 B1 round 13)", () => {
  async function saveLoaded(equipmentSelection: unknown) {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/pricing-config")) {
        return { ok: true, json: async () => ({ pricingConfig: { dehumidifierLGRDailyRate: 70 } }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<EquipmentToolsSelection reportId="r1" initialData={{ equipmentSelection }} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/pricing-config"));
    fireEvent.click(screen.getByText("Next: Scope Areas"));
    fireEvent.click(screen.getByText("Next: Select Equipment"));
    fireEvent.click(screen.getByText("Save & Complete"));
    await waitFor(() => expect(equipmentPosts()).toHaveLength(1));
    return JSON.parse(String((equipmentPosts()[0][1] as RequestInit).body));
  }

  it.each([
    ["a null entry beside a readable line", [null, { groupId: "lgr-85", quantity: 2, dailyRate: 61 }]],
    ["the stored column text", JSON.stringify([null, { groupId: "lgr-85", quantity: 2, dailyRate: 61 }])],
  ])("%s: the screen renders and saves only the readable line at the price-list rate", async (_label, saved) => {
    const body = await saveLoaded(saved);
    expect(body.equipmentSelection).toHaveLength(1);
    expect(body.equipmentSelection[0]).toMatchObject({ groupId: "lgr-85", quantity: 2 });
    expect(body.equipmentSelection[0].dailyRate).not.toBe(61);
    expect(body.equipmentCostTotal).toBe(70 * 2 * body.estimatedDryingDuration);
  });
});
