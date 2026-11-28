// @vitest-environment jsdom
/**
 * RA-8642: every lab value the report reader can write (LAB_FIELDS) must have a
 * box on the mould form, so "enter the results by hand" is something a
 * technician can actually do. Counts keep 0 and decimals; a spore type the
 * form does not list is shown and sent back unchanged.
 */
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NIRClaimAssessmentPanel, {
  type NIRClaimAssessmentPanelHandle,
} from "../NIRClaimAssessmentPanel";
import { LAB_FIELDS, LAB_FIELD_LABELS } from "@/lib/third-party-report/schema";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/third-party-report/ThirdPartyReportReader", () => ({
  default: () => <div data-testid="reader-stub" />,
}));

const EMPTY_LAB = {
  labName: null,
  labReportReference: null,
  samplingDate: null,
  sporeType: null,
  sporeCountPreRemediation: null,
  outdoorBaselineCount: null,
  sporeCountPostRemediation: null,
};

function stubFetch(loaded: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "m1", ...body }), { status: 200 });
    }
    if (String(url).endsWith("/mould-remediation"))
      return new Response(JSON.stringify({ id: "m1", ...loaded }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
}

afterEach(() => vi.unstubAllGlobals());

async function mounted(loaded: Record<string, unknown> = { ...EMPTY_LAB }) {
  const postBodies = stubFetch(loaded);
  const ref = createRef<NIRClaimAssessmentPanelHandle>();
  render(<NIRClaimAssessmentPanel ref={ref} inspectionId="insp_1" lockedClaimType="MOULD" />);
  await waitFor(() => expect(ref.current?.isReady()).toBe(true));
  return { postBodies, ref };
}

const box = (field: (typeof LAB_FIELDS)[number]) =>
  screen.getByLabelText(LAB_FIELD_LABELS[field]) as HTMLInputElement;

describe("Mould form lab inputs (RA-8642)", () => {
  it("renders an input for every field in LAB_FIELDS", async () => {
    await mounted();
    const missing = LAB_FIELDS.filter(
      (f) => screen.queryByLabelText(LAB_FIELD_LABELS[f]) === null,
    );
    expect(missing).toEqual([]);
  });

  it("sends hand-typed lab name, reference, sampling date and outdoor baseline on Save", async () => {
    const { postBodies, ref } = await mounted();
    fireEvent.change(box("labName"), { target: { value: "Envirolab Sydney" } });
    fireEvent.change(box("labReportReference"), { target: { value: "ELS-12345" } });
    fireEvent.change(box("samplingDate"), { target: { value: "2026-11-20" } });
    fireEvent.change(box("outdoorBaselineCount"), { target: { value: "850" } });
    await act(() => ref.current!.persistAssessment());
    expect(postBodies()[0]).toMatchObject({
      labName: "Envirolab Sydney",
      labReportReference: "ELS-12345",
      samplingDate: "2026-11-20T00:00:00.000Z",
      outdoorBaselineCount: 850,
    });
  });

  it("shows a saved count of 0 as 0 and keeps a typed decimal", async () => {
    const { postBodies, ref } = await mounted({ ...EMPTY_LAB, sporeCountPostRemediation: 0 });
    expect(box("sporeCountPostRemediation").value).toBe("0");
    fireEvent.change(box("sporeCountPreRemediation"), { target: { value: "1234.5" } });
    await act(() => ref.current!.persistAssessment());
    expect(postBodies()[0]).toMatchObject({
      sporeCountPreRemediation: 1234.5,
      sporeCountPostRemediation: 0,
    });
  });

  it("shows a saved spore type outside the old fixed list and sends it back unchanged", async () => {
    const { postBodies, ref } = await mounted({ ...EMPTY_LAB, sporeType: "Chaetomium" });
    expect(box("sporeType").value).toBe("Chaetomium");
    await act(() => ref.current!.persistAssessment());
    expect(postBodies()[0].sporeType).toBe("Chaetomium");
  });

  it("shows a saved sampling date in the date box", async () => {
    await mounted({ ...EMPTY_LAB, samplingDate: "2026-11-20T00:00:00.000Z" });
    expect(box("samplingDate").value).toBe("2026-11-20");
  });
});
