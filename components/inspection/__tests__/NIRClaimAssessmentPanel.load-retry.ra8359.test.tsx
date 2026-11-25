// @vitest-environment jsdom
/**
 * RA-8359: a failed first read of the claim assessment panel was never
 * retried, and the panel showed an empty form that looked like "no assessment
 * yet". The panel must show the error with Try again, re-read on Try again or
 * Save Draft, and never write over a saved record it has not read.
 */
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NIRClaimAssessmentPanel, {
  type NIRClaimAssessmentPanelHandle,
} from "../NIRClaimAssessmentPanel";
import { saveDraftParts, sidecarPart } from "@/lib/nir-draft-save";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const STORED = { id: "m1", mouldConditionLevel: "CONDITION_3" };

/** The mould read fails `failures` times, then returns the stored record.
 *  The compliance read always answers 404 (no record yet). */
function stubFetch(failures: number) {
  let mouldReads = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return jsonResponse({});
    if (String(url).endsWith("/mould-remediation")) {
      mouldReads += 1;
      if (mouldReads <= failures) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse(STORED);
    }
    return jsonResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    posts: () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    mouldReads: () => mouldReads,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("NIRClaimAssessmentPanel: failed first read (RA-8359)", () => {
  it("shows the error, not an empty form, and Try again re-reads and recovers", async () => {
    const io = stubFetch(1);
    const ref = createRef<NIRClaimAssessmentPanelHandle>();
    render(
      <NIRClaimAssessmentPanel ref={ref} inspectionId="insp_1" lockedClaimType="MOULD" />,
    );

    const notice = await screen.findByTestId("nir-claim-assessment-load-error");
    expect(notice).toHaveTextContent(/couldn.t load the saved Mould/i);
    expect(notice).toHaveTextContent(/press Try again/i);
    expect(notice).not.toHaveTextContent(/press Save Draft again/i);
    // The empty form is not shown, so nothing looks like "not started".
    expect(screen.queryByText(/Condition Level/i)).not.toBeInTheDocument();
    expect(ref.current?.isReady()).toBe(false);
    expect(ref.current?.loadFailed()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.getByText(/Condition Level/i)).toBeInTheDocument());
    expect(screen.queryByTestId("nir-claim-assessment-load-error")).not.toBeInTheDocument();
    expect(io.mouldReads()).toBe(2);
    expect(ref.current?.isReady()).toBe(true);
    expect(ref.current?.loadFailed()).toBe(false);
    expect(screen.getByDisplayValue(/Condition 3/)).toBeInTheDocument();
  });

  it("never posts over the stored record while the read has failed", async () => {
    const io = stubFetch(Infinity);
    const ref = createRef<NIRClaimAssessmentPanelHandle>();
    render(
      <NIRClaimAssessmentPanel ref={ref} inspectionId="insp_1" lockedClaimType="MOULD" />,
    );
    await screen.findByTestId("nir-claim-assessment-load-error");

    await expect(ref.current!.persist()).rejects.toThrow(/could not be loaded/);
    await expect(ref.current!.persistAssessment()).rejects.toThrow(/nothing was saved/);

    // Save Draft re-reads; the read still fails, so it refuses and says why.
    const result = await act(() =>
      saveDraftParts([
        sidecarPart("claim assessment", {
          panel: () => ref.current,
          hasPendingData: () => false,
          wasOnScreen: true,
        }),
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.failures[0].message).toMatch(/could not be loaded, so it was not saved/);
    expect(result.failures[0].message).not.toMatch(/press Save Draft again/);
    expect(io.mouldReads()).toBe(2);
    expect(io.posts()).toHaveLength(0);
  });

  it("Save Draft re-reads a failed panel and saves once the read succeeds", async () => {
    const io = stubFetch(1);
    const ref = createRef<NIRClaimAssessmentPanelHandle>();
    render(
      <NIRClaimAssessmentPanel ref={ref} inspectionId="insp_1" lockedClaimType="MOULD" />,
    );
    await screen.findByTestId("nir-claim-assessment-load-error");

    const result = await act(() =>
      saveDraftParts([
        sidecarPart("claim assessment", {
          panel: () => ref.current,
          hasPendingData: () => false,
          wasOnScreen: true,
        }),
      ]),
    );
    expect(result).toEqual({ ok: true, failures: [] });
    expect(io.mouldReads()).toBe(2);
    // The write carries the stored record that was just read, not an empty form.
    const [, init] = io.posts()[0];
    expect(JSON.parse(String(init?.body))).toMatchObject(STORED);
  });

  it("a failed compliance read hides that form and Try again recovers it", async () => {
    let complianceReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/australian-compliance")) {
          complianceReads += 1;
          if (complianceReads === 1) throw new TypeError("Failed to fetch");
          return jsonResponse({ insurerName: "Stored Insurer" });
        }
        return jsonResponse({}, 404);
      }),
    );
    const ref = createRef<NIRClaimAssessmentPanelHandle>();
    render(
      <NIRClaimAssessmentPanel ref={ref} inspectionId="insp_1" lockedClaimType="MOULD" />,
    );
    const notice = await screen.findByTestId("nir-compliance-load-error");
    expect(notice).toHaveTextContent(/Australian Compliance record/);
    expect(screen.queryByText(/Insurer · Technician credentials/)).not.toBeInTheDocument();
    expect(ref.current?.isReady()).toBe(false);
    await expect(ref.current!.persistCompliance()).rejects.toThrow(/nothing was saved/);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(screen.getByText(/Insurer · Technician credentials/)).toBeInTheDocument(),
    );
    expect(complianceReads).toBe(2);
    expect(ref.current?.isReady()).toBe(true);
  });
});
