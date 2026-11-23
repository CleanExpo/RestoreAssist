// @vitest-environment jsdom
/**
 * RA-8531 — opening a job never writes the make-safe checklist.
 *
 * With `autoSave` (the job page), the panel sent a PATCH when the page loaded
 * although nobody had touched it: for the owner that write landed (viewing the
 * page wrote data), and for a manager it returned 404 and a console error. The
 * autosave now writes only after the stored rows have loaded and only when the
 * checklist differs from what was loaded or last saved.
 */
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const useFetchMock = vi.fn();
vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (...a: unknown[]) => useFetchMock(...a),
}));

import { MakeSafeChecklist } from "@/components/inspection/MakeSafeChecklist";

const STANDARD = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
];

const STORED = {
  data: STANDARD.map((action) => ({
    action,
    applicable: action !== "gas_isolated",
    completed: action === "power_isolated",
    notes: null,
  })),
  actions: STANDARD,
};

const fetchMock = vi.fn();

function patchCalls() {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
  );
}

function mount() {
  return render(
    <StrictMode>
      <MakeSafeChecklist inspectionId="insp-1" autoSave />
    </StrictMode>,
  );
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useFetchMock.mockReset();
  fetchMock.mockReset();
});

describe("MakeSafeChecklist autosave (RA-8531)", () => {
  it("loading the stored checklist sends no save", async () => {
    useFetchMock.mockReturnValue({ data: STORED, loading: false, error: null });
    mount();
    await wait(2000);
    expect(patchCalls()).toHaveLength(0);
  });

  it("sends no save while the stored rows are still loading, even when the load is slow", async () => {
    useFetchMock.mockReturnValue({ data: null, loading: true, error: null });
    const view = mount();
    await wait(2000);
    expect(patchCalls()).toHaveLength(0);

    useFetchMock.mockReturnValue({ data: STORED, loading: false, error: null });
    view.rerender(
      <StrictMode>
        <MakeSafeChecklist inspectionId="insp-1" autoSave />
      </StrictMode>,
    );
    await wait(2000);
    expect(patchCalls()).toHaveLength(0);
  });

  it("an edit is saved once, and no second save follows while nothing changes", async () => {
    useFetchMock.mockReturnValue({ data: STORED, loading: false, error: null });
    mount();
    await wait(2000);

    fireEvent.change(screen.getByLabelText(/notes for "power isolated/i), {
      target: { value: "Isolated at the switchboard" },
    });
    await wait(1000);
    expect(patchCalls()).toHaveLength(1);
    const body = JSON.parse(String((patchCalls()[0][1] as RequestInit).body));
    expect(JSON.stringify(body)).toContain("Isolated at the switchboard");

    // Nothing changed since that save: no second write.
    await wait(2000);
    expect(patchCalls()).toHaveLength(1);
  });

  it("without autoSave, editing never saves", async () => {
    useFetchMock.mockReturnValue({ data: STORED, loading: false, error: null });
    render(<MakeSafeChecklist inspectionId="insp-1" />);
    fireEvent.change(screen.getByLabelText(/notes for "power isolated/i), {
      target: { value: "x" },
    });
    await wait(2000);
    expect(patchCalls()).toHaveLength(0);
  });
});
