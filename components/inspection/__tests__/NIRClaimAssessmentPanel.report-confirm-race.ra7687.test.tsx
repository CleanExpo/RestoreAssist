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
    onApplied: (a: Record<string, string | number>, updatedAt: string | null) => void;
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

const LOADED_AT = "2026-11-23T01:00:00.000Z";
const SAVED_AT = "2026-11-23T01:05:00.000Z";

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return jsonResponse({ id: "m1", updatedAt: SAVED_AT });
    if (String(url).endsWith("/mould-remediation"))
      return jsonResponse({ id: "m1", labName: "Old Lab", updatedAt: LOADED_AT });
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
  it("sends the row version it loaded, then the version its own Save returned", async () => {
    const { io, ref } = await mounted();
    await act(() => ref.current!.persistAssessment());
    await act(() => ref.current!.persistAssessment());
    expect(io.postBodies().map((b) => b.expectedUpdatedAt)).toEqual([LOADED_AT, SAVED_AT]);
  });

  it("adopts the version a report confirm returns, so the next Save is not stale", async () => {
    const { io, ref } = await mounted();
    act(() => reader.props!.onApplied({ labName: "New Lab" }, "2026-11-23T01:09:00.000Z"));
    await act(() => ref.current!.persistAssessment());
    expect(io.postBodies()[0]).toMatchObject({
      labName: "New Lab",
      expectedUpdatedAt: "2026-11-23T01:09:00.000Z",
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
