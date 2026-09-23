// @vitest-environment jsdom
/**
 * RA-7709 — a Category / Class pick saved in the Claim-type evidence panel is
 * a technician choice. The panel must hand it to the form (which feeds the
 * Review & Submit preview and the draft save), and hand over a clear when the
 * technician removes it. Saves that never touched Category / Class hand over
 * nothing.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NIRClaimAssessmentPanel from "../NIRClaimAssessmentPanel";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

let saved: Record<string, unknown> | null = null;

beforeEach(() => {
  saved = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (
        String(url).endsWith("/water-damage-classification") &&
        init?.method === "POST"
      ) {
        saved = { ...(saved ?? {}), ...JSON.parse(String(init.body)) };
        return { ok: true, status: 200, json: async () => saved };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function selectFor(optionText: string): HTMLSelectElement {
  return screen.getByText(optionText).closest("select") as HTMLSelectElement;
}

async function renderPanel() {
  const onWaterClassificationSaved = vi.fn();
  render(
    <NIRClaimAssessmentPanel
      inspectionId="insp_1"
      lockedClaimType="WATER"
      onWaterClassificationSaved={onWaterClassificationSaved}
    />,
  );
  await screen.findByText("Cat 2 — Grey Water");
  return onWaterClassificationSaved;
}

async function save() {
  fireEvent.click(screen.getByText("Save Assessment"));
  await waitFor(() =>
    expect(screen.getByText("Save Assessment")).toBeInTheDocument(),
  );
}

describe("RA-7709 panel Category / Class choice reaches the form", () => {
  it("saving Cat 2 / Class 3 reports { category: '2', class: '3' }", async () => {
    const onSaved = await renderPanel();
    fireEvent.change(selectFor("Cat 2 — Grey Water"), {
      target: { value: "CAT_2" },
    });
    fireEvent.change(selectFor("Class 3 — Fastest Evaporation"), {
      target: { value: "CLASS_3" },
    });
    await save();

    await waitFor(() =>
      expect(onSaved).toHaveBeenLastCalledWith({ category: "2", class: "3" }),
    );
  });

  it("clearing a saved pick reports null", async () => {
    const onSaved = await renderPanel();
    fireEvent.change(selectFor("Cat 2 — Grey Water"), {
      target: { value: "CAT_2" },
    });
    fireEvent.change(selectFor("Class 3 — Fastest Evaporation"), {
      target: { value: "CLASS_3" },
    });
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    fireEvent.change(selectFor("Cat 2 — Grey Water"), {
      target: { value: "" },
    });
    fireEvent.change(selectFor("Class 3 — Fastest Evaporation"), {
      target: { value: "" },
    });
    await save();

    await waitFor(() => expect(onSaved).toHaveBeenLastCalledWith(null));
  });

  it("a save that never set Category / Class reports nothing", async () => {
    const onSaved = await renderPanel();
    fireEvent.change(selectFor("Plumbing"), {
      target: { value: "PLUMBING" },
    });
    await save();

    await waitFor(() => expect(saved).not.toBeNull());
    expect(onSaved).not.toHaveBeenCalled();
  });
});
