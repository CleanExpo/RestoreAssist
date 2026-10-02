// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn(),
  }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", role: "ADMIN" } } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

import InitialDataEntryForm from "@/components/InitialDataEntryForm";
import InspectionReportViewer from "@/components/InspectionReportViewer";
import { FormNavigation } from "@/components/initial-data-entry/FormNavigation";

const entryBodies: Record<string, unknown>[] = [];
const entryKeys: string[] = [];
const calls: string[] = [];
let inspectionWarning: string | null = null;
let saveFailures = 0;
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
beforeEach(() => {
  entryBodies.length = 0;
  entryKeys.length = 0;
  calls.length = 0;
  inspectionWarning = null;
  saveFailures = 0;
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    if (url === "/api/reports/initial-entry") {
      entryBodies.push(JSON.parse(String(init?.body)));
      entryKeys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      if (saveFailures > 0) {
        saveFailures -= 1;
        throw new Error("synthetic lost response");
      }
      return jsonResponse({ report: { id: "r1" }, inspectionLinkWarning: inspectionWarning });
    }
    if (url === "/api/reports/r1") return jsonResponse({ id: "r1", status: "DRAFT", detailedReport: null, reportDepthLevel: null });
    if (url.includes("/api/user/quick-fill-credits")) return jsonResponse({ hasUnlimited: true, creditsRemaining: 0 });
    return jsonResponse({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("initial entry requires an explicit save and generation action", () => {
  it("saves a pre-inspection draft with no technician report", async () => {
    render(<InitialDataEntryForm initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
    }} />);
    for (let i = 0; i < 10; i++) {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    }
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Save & Continue/ })));
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].technicianFieldReport).toBe("");
  });

  it("surfaces a failed inspection link while retaining the saved report", async () => {
    inspectionWarning = "Report saved, but its inspection link could not be updated.";
    const toast = (await import("react-hot-toast")).default;
    const { container } = render(<InitialDataEntryForm initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
    }} />);
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    expect(entryBodies).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith(inspectionWarning);
    expect(await screen.findByText("Review All Data")).toBeInTheDocument();
  });

  it("reuses the create key after a lost response so a retry cannot charge twice", async () => {
    saveFailures = 1;
    const { container } = render(<InitialDataEntryForm initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
    }} />);
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    expect(entryBodies).toHaveLength(2);
    expect(entryKeys[0].length).toBeGreaterThanOrEqual(8);
    expect(entryKeys[1]).toBe(entryKeys[0]);
    expect(await screen.findByText("Review All Data")).toBeInTheDocument();
  });

  it("moving to the last step does not submit the reused navigation button", () => {
    const submitted = vi.fn((event: React.FormEvent) => event.preventDefault());
    function Wizard() {
      const [step, setStep] = useState(0);
      return <form onSubmit={submitted}>
        <FormNavigation currentStep={step} totalSteps={2} isValid isLastStep={step === 1}
          loading={false} onPrevious={() => setStep(0)} onNext={() => setStep(1)} />
      </form>;
    }
    render(<Wizard />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: /Save & Continue/ })).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Save & Continue/ }));
    expect(submitted).toHaveBeenCalledOnce();
  });

  it("keeps missing screens and calculator examples out of an explicit save", async () => {
    const { container } = render(<InitialDataEntryForm initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
      technicianFieldReport: "Synthetic intake notes", scopeAreas: [{
        name: "Test room", length: 4, width: 4, height: 2.7, wetPercentage: 100,
      }],
    }} />);
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].methamphetamineScreen).toBe("");
    expect(entryBodies[0].biologicalMouldDetected).toBe(false);
    expect(entryBodies[0].equipmentData).toBeNull();
    expect(await screen.findByText("Review All Data")).toBeInTheDocument();
    expect(screen.queryByText(/Equipment Selection \(/)).not.toBeInTheDocument();
  });

  it("starts a blank claim with meth screening unassessed", async () => {
    const { container } = render(<InitialDataEntryForm />);
    fireEvent.change(screen.getByPlaceholderText("Enter client's full name"), {
      target: { value: "Synthetic Client" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    fireEvent.change(screen.getByPlaceholderText("Start typing an address to search…"), {
      target: { value: "1 Test Street" },
    });
    fireEvent.change(container.querySelector('input[maxlength="4"]')!, {
      target: { value: "4000" },
    });
    for (let i = 0; i < 7; i++) {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    }
    const methScreen = [...container.querySelectorAll("select")].find((element) =>
      [...element.options].some((option) => option.value === "NEGATIVE"));
    expect(methScreen).toHaveValue("");
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].methamphetamineScreen).toBe("");
  });

  it("includes supplied calculator inputs only after the explicit choice", async () => {
    const { container } = render(<InitialDataEntryForm initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
      technicianFieldReport: "Synthetic intake notes", psychrometricWaterClass: 3,
      psychrometricTemperature: 21, psychrometricHumidity: 67,
      scopeAreas: [{ name: "Test room", length: 4, width: 4, height: 2.7, wetPercentage: 50 }],
    }} />);
    for (let i = 0; i < 10; i++) {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    }
    fireEvent.click(screen.getByRole("checkbox", {
      name: /Include this equipment estimate and its inputs/,
    }));
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    expect(entryBodies).toHaveLength(1);
    expect((entryBodies[0].equipmentData as any).psychrometricAssessment).toMatchObject({
      waterClass: 3, temperature: 21, humidity: 67,
    });
  });

  it("keeps explicitly supplied positive findings", async () => {
    const { container } = render(<InitialDataEntryForm initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
      technicianFieldReport: "Synthetic intake notes", methamphetamineScreen: "POSITIVE",
      biologicalMouldDetected: true, biologicalMouldCategory: "CAT 2",
    }} />);
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].methamphetamineScreen).toBe("POSITIVE");
    expect(entryBodies[0].biologicalMouldDetected).toBe(true);
    expect(entryBodies[0].biologicalMouldCategory).toBe("CAT 2");
  });

  it("opens an ungenerated draft without starting generation", async () => {
    render(<InspectionReportViewer reportId="r1" />);
    await screen.findByRole("button", { name: "Generate Basic Report" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
    expect(calls).not.toContain("/api/reports/generate-inspection-report");
    fireEvent.click(screen.getByRole("button", { name: "Generate Basic Report" }));
    await waitFor(() => expect(calls).toContain("/api/reports/generate-inspection-report"));
  });

  it("saves an unknown-hazard draft and opens it without generating a report", async () => {
    const { container, unmount } = render(<InitialDataEntryForm initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
    }} />);
    await act(async () => fireEvent.submit(container.querySelector("form")!));
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].methamphetamineScreen).toBe("");
    expect(entryBodies[0].biologicalMouldDetected).toBe(false);
    unmount();

    render(<InspectionReportViewer reportId="r1" />);
    await screen.findByRole("button", { name: "Generate Basic Report" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
    expect(calls).not.toContain("/api/reports/generate-inspection-report");
  });
});
