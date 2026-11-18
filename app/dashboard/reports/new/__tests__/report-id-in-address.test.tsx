// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RA-8460: the id of a report the server has already saved must live in the
 * address, not only in page memory. Before this, a refresh after "Report saved"
 * opened an empty New Report form, and saving it again made a second report and
 * charged a second credit.
 *
 * Rule under test: when the workflow reports a created id, the page puts it in
 * the address (?reportId=<id>), and a page mounted with that address reopens
 * the saved report instead of the empty form.
 */

let currentParams = new URLSearchParams();
const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => currentParams,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, update: vi.fn() }),
}));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/components/AiOwnershipPreGenerateNotice", () => ({
  default: () => null,
}));

let workflowMounts = 0;
vi.mock("@/components/ReportWorkflow", () => {
  function WorkflowStub(props: {
    reportId?: string;
    onReportCreated?: (id: string) => void;
  }) {
    useEffect(() => {
      workflowMounts += 1;
    }, []);
    return (
      <div data-testid="workflow" data-report-id={props.reportId ?? ""}>
        <button type="button" onClick={() => props.onReportCreated?.("abc")}>
          simulate-save
        </button>
      </div>
    );
  }
  return { default: WorkflowStub };
});

// Used only by the ReportWorkflow forwarding test, which loads the real module.
vi.mock("@/components/InitialDataEntryForm", () => ({
  default: (props: { onReportCreated?: (id: string) => void }) => (
    <button type="button" onClick={() => props.onReportCreated?.("xyz")}>
      form-save
    </button>
  ),
}));

import NewReportPage from "../page";

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  currentParams = new URLSearchParams();
  replace.mockReset();
  push.mockReset();
  workflowMounts = 0;
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/reports/check-credits") return okJson({ allowed: true });
    if (url === "/api/user/profile")
      return okJson({ profile: { subscriptionStatus: "ACTIVE" } });
    if (url === "/api/onboarding/status")
      return okJson({ isComplete: true, steps: { subscription: { completed: true } } });
    if (url === "/api/reports/abc")
      return okJson({ id: "abc", clientName: "Alpha", propertyAddress: "1 Test St" });
    return okJson({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const reportFetches = () =>
  fetchMock.mock.calls.filter(([u]) => String(u) === "/api/reports/abc").length;

describe("RA-8460 New Report keeps the saved report id in the address", () => {
  it("puts the created report id in the address", async () => {
    render(<NewReportPage />);
    const workflow = await screen.findByTestId("workflow");
    fireEvent.click(screen.getByText("simulate-save"));
    expect(workflow).toBeInTheDocument();
    expect(replace).toHaveBeenCalledTimes(1);
    const target = String(replace.mock.calls[0][0]);
    expect(target.startsWith("/dashboard/reports/new?")).toBe(true);
    expect(new URLSearchParams(target.split("?")[1]).get("reportId")).toBe("abc");
  });

  it("does not reload or remount the workflow when the address catches up in the same visit", async () => {
    const { rerender } = render(<NewReportPage />);
    await screen.findByTestId("workflow");
    fireEvent.click(screen.getByText("simulate-save"));
    const mountsBefore = workflowMounts;

    currentParams = new URLSearchParams("reportId=abc");
    await act(async () => {
      rerender(<NewReportPage />);
    });

    expect(screen.getByTestId("workflow")).toBeInTheDocument();
    expect(workflowMounts).toBe(mountsBefore);
    expect(reportFetches()).toBe(0);
  });

  it("a refresh with ?reportId= reopens that report, not the empty form", async () => {
    currentParams = new URLSearchParams("reportId=abc");
    render(<NewReportPage />);
    await waitFor(() =>
      expect(screen.getByTestId("workflow")).toHaveAttribute("data-report-id", "abc"),
    );
    expect(reportFetches()).toBeGreaterThan(0);
  });

  it("Start Fresh clears the id from the address and gives a fresh workflow", async () => {
    currentParams = new URLSearchParams("reportId=abc");
    render(<NewReportPage />);
    await waitFor(() =>
      expect(screen.getByTestId("workflow")).toHaveAttribute("data-report-id", "abc"),
    );
    const mountsBefore = workflowMounts;
    fireEvent.click(screen.getByText("Start Fresh"));
    expect(replace).toHaveBeenLastCalledWith("/dashboard/reports/new");
    currentParams = new URLSearchParams();
    await waitFor(() => expect(workflowMounts).toBeGreaterThan(mountsBefore));
  });
});

describe("RA-8460 ReportWorkflow forwards the created id", () => {
  it("calls onReportCreated with the id the form saved, and stores nothing in browser storage", async () => {
    const { default: RealReportWorkflow } = await vi.importActual<
      typeof import("@/components/ReportWorkflow")
    >("@/components/ReportWorkflow");
    const onReportCreated = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<RealReportWorkflow onReportCreated={onReportCreated} />);
    fireEvent.click(screen.getByText("form-save"));
    expect(onReportCreated).toHaveBeenCalledWith("xyz");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
