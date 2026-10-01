// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("react-hot-toast", () => ({ default: { success: state.success, error: state.error } }));
vi.mock("@/components/ScopingEngine", () => ({ default: () => null }));
vi.mock("@/components/EstimationEngine", () => ({ default: () => null }));
import EditReportPage from "../page";

let report: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TZ", "Australia/Sydney");
  report = { id: "synthetic-report", title: "Synthetic Report", clientName: "Synthetic Client",
    propertyAddress: "1 Test Street", hazardType: "Water", waterCategory: "Category 1",
    waterClass: "Class 1", inspectionDate: null, insuranceType: "" };
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      if (body.inspectionDate === "") return Response.json({ error: "inspectionDate is not a valid date" }, { status: 400 });
      return Response.json({ ...report, ...body });
    }
    if (url === "/api/reports/synthetic-report") return Response.json(report);
    if (url === "/api/clients") return Response.json({ clients: [] });
    if (url.startsWith("/api/scopes?") || url.startsWith("/api/estimates?")) return Response.json({});
    throw new Error(`Unexpected synthetic request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function open() {
  render(<EditReportPage params={Promise.resolve({ id: "synthetic-report" })} />);
  await screen.findByRole("button", { name: "Save Inspection" });
  return screen.getByLabelText("Inspection Date & Time") as HTMLInputElement;
}
function puts() { return fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT"); }

describe("edit keeps unknown metadata and explicit date rejection", () => {
  it("saves an unknown date without fabricating attendance or coverage", async () => {
    const input = await open();
    expect(input.value).toBe("");
    expect(screen.getByText("Select insurance type")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Inspection" }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const body = JSON.parse(String(puts()[0][1].body));
    expect(body.inspectionDate).toBeNull();
    expect(body.insuranceType).toBe("");
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
  });
  it.each(["Building and Contents Insurance", "Legacy off-list cover"])("preserves a known date and insurance text %s", async (insuranceType) => {
    report.inspectionDate = "2026-09-01T09:00:00Z";
    report.insuranceType = insuranceType;
    const input = await open();
    const loaded = input.value;
    expect(loaded).toBe("2026-09-01T09:00"); // Preserve existing UTC display; timezone repair is separate.
    fireEvent.click(screen.getByRole("button", { name: "Save Inspection" }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const body = JSON.parse(String(puts()[0][1].body));
    expect(body.inspectionDate).toBe(loaded);
    expect(body.insuranceType).toBe(insuranceType);
  });
  it("keeps the explicit error when a known stored date is cleared", async () => {
    report.inspectionDate = "2026-09-01T09:00:00Z";
    const input = await open();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Inspection" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(String(puts()[0][1].body)).inspectionDate).toBe("");
    expect(state.success).not.toHaveBeenCalled();
  });
});
