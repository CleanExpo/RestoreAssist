// @vitest-environment jsdom
/**
 * RA-8229 — a moisture-meter photo becomes a recorded reading beside the
 * drying workflow. The drying monitoring page carries the meter photo
 * capture (moisture mode) for its own job, and reloads the drying log once
 * the technician accepts a reading, so the new reading shows without leaving
 * the page. The capture itself (photo, vision read, confirm, save) is tested
 * on MeterPhotoCapture.
 */
import { Suspense } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const capture = vi.hoisted(() => ({
  props: [] as Array<{ inspectionId: string; mode: string }>,
}));
vi.mock("@/components/inspection/MeterPhotoCapture", () => ({
  MeterPhotoCapture: (props: {
    inspectionId: string;
    mode: string;
    onReadingAccepted?: () => void;
  }) => {
    capture.props.push({ inspectionId: props.inspectionId, mode: props.mode });
    return (
      <button type="button" onClick={() => props.onReadingAccepted?.()}>
        Accept meter reading
      </button>
    );
  },
}));

import MonitoringPage from "../page";

const report = {
  inspectionNumber: "NIR-1",
  propertyAddress: "1 Test St",
  technicianName: null,
  iicrcReference: "IICRC S500",
  totalDaysMonitored: 0,
  currentAvgMoisture: null,
  overallDryingStatus: "in_progress",
  dailyLogs: [],
};

let reportFetches = 0;

beforeEach(() => {
  reportFetches = 0;
  capture.props.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/monitoring-report")) reportFetches += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ report }),
      } as Response;
    }),
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
  await screen.findByText("Add a reading from a meter photo");
}

describe("RA-8229 photo-to-reading on the drying monitoring page", () => {
  it("offers the meter photo capture for this job, in moisture mode", async () => {
    await renderPage();
    expect(capture.props.at(-1)).toEqual({
      inspectionId: "job-1",
      mode: "moisture",
    });
  });

  it("reloads the drying log after a reading is accepted", async () => {
    await renderPage();
    expect(reportFetches).toBe(1);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Accept meter reading" }),
      );
    });

    await vi.waitFor(() => expect(reportFetches).toBe(2));
  });
});
