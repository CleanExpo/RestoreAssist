// @vitest-environment jsdom
/**
 * RA-7687: a Save of the mould assessment must name the row version it loaded
 * (so the server refuses it if a report confirm changed the row since), must
 * adopt the version a confirm or its own Save returns, and must be held while
 * a report confirm is in flight.
 */
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NIRClaimAssessmentPanel, {
  type NIRClaimAssessmentPanelHandle,
} from "../NIRClaimAssessmentPanel";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const reader = vi.hoisted(() => ({
  props: null as null | {
    onApplied: (a: Record<string, string | number>, storedLab: Record<string, string | number | null> | null) => void;
    onBusyChange: (busy: boolean) => void;
  },
}));
vi.mock("@/components/third-party-report/ThirdPartyReportReader", () => ({
  default: (props: NonNullable<typeof reader.props>) => {
    reader.props = props;
    return <div data-testid="reader-stub" />;
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMPTY_LAB = {
  labName: null,
  labReportReference: null,
  samplingDate: null,
  sporeType: null,
  sporeCountPreRemediation: null,
  outdoorBaselineCount: null,
  sporeCountPostRemediation: null,
};
const LOADED_LAB = { ...EMPTY_LAB, labName: "Old Lab" };
const SAVED_LAB = { ...EMPTY_LAB, labName: "Edited Lab" };

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return jsonResponse({ id: "m1", ...SAVED_LAB });
    if (String(url).endsWith("/mould-remediation"))
      return jsonResponse({ id: "m1", ...LOADED_LAB, mouldConditionLevel: null });
    return jsonResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    postBodies: () =>
      fetchMock.mock.calls
        .filter(([, init]) => init?.method === "POST")
        .map(([, init]) => JSON.parse(String(init?.body))),
  };
}

afterEach(() => vi.unstubAllGlobals());

async function mounted() {
  const io = stubFetch();
  const ref = createRef<NIRClaimAssessmentPanelHandle>();
  render(<NIRClaimAssessmentPanel ref={ref} inspectionId="insp_1" lockedClaimType="MOULD" />);
  await waitFor(() => expect(screen.getByTestId("reader-stub")).toBeInTheDocument());
  await waitFor(() => expect(ref.current?.isReady()).toBe(true));
  return { io, ref };
}

describe("NIRClaimAssessmentPanel: report confirm and Save (RA-7687)", () => {
  it("sends the lab values it loaded, then the values its own Save returned", async () => {
    const { io, ref } = await mounted();
    await act(() => ref.current!.persistAssessment());
    await act(() => ref.current!.persistAssessment());
    expect(io.postBodies().map((b) => b.expectedLab)).toEqual([LOADED_LAB, SAVED_LAB]);
  });

  it("adopts the stored lab values a report confirm returns, so the next Save is not stale", async () => {
    const { io, ref } = await mounted();
    act(() => reader.props!.onApplied({ labName: "New Lab" }, { ...EMPTY_LAB, labName: "New Lab" }));
    await act(() => ref.current!.persistAssessment());
    expect(io.postBodies()[0]).toMatchObject({
      labName: "New Lab",
      expectedLab: { ...EMPTY_LAB, labName: "New Lab" },
    });
  });

  it("holds the Save while a report confirm is in flight and sends nothing", async () => {
    const { io, ref } = await mounted();
    act(() => reader.props!.onBusyChange(true));
    await expect(ref.current!.persistAssessment()).rejects.toThrow(/still being saved/);
    expect(io.postBodies()).toHaveLength(0);
    act(() => reader.props!.onBusyChange(false));
    await act(() => ref.current!.persistAssessment());
    expect(io.postBodies()).toHaveLength(1);
  });
});
