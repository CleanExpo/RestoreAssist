// @vitest-environment jsdom
/**
 * RA-7625 — the report screens and the default report instructions must name
 * New Zealand law on a New Zealand job.
 *
 * RA-7361/RA-7599 fixed generation, but the progress notes on the cost, scope
 * and inspection screens, and the Initial Data Entry instructions that are
 * sent into generation, still said "WHS Regulations 2011, NCC" for every job.
 * Each case below has an Australian control, so a check that can never see
 * Australian law cannot pass the New Zealand assertion by accident.
 *
 * The jurisdiction arrives from the server as `lawJurisdiction`, resolved by
 * generation's own rule (see route.law-jurisdiction.test.ts). The NZ cases
 * keep the inspection's schema-default "AU" to prove the screens do not read
 * that column: an NZ organisation must not be hidden by it (RA-7599).
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", role: "ADMIN" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

import CostEstimationViewer from "@/components/CostEstimationViewer";
import ScopeOfWorksViewer from "@/components/ScopeOfWorksViewer";
import InspectionReportViewer from "@/components/InspectionReportViewer";
import InitialDataEntryForm from "@/components/InitialDataEntryForm";

type Jurisdiction = "NZ" | "AU" | "unknown";

const AU_LAW = [/WHS Regulations/, /\bNCC\b/];

function expectNz(text: string) {
  // The storm instruction only ever cited a building code, so NZ law here is
  // HSWA 2015 or the NZ Building Code, whichever the AU text named.
  expect(text).toMatch(/HSWA 2015 \(WorkSafe NZ\)|NZ Building Code/);
  expect(text).not.toMatch(AU_LAW[0]);
  expect(text).not.toMatch(AU_LAW[1]);
}

let jurisdiction: Jurisdiction = "NZ";
let entryBodies: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  entryBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/reports/generate-")) {
        // Hold generation open so the "generating" note stays on screen.
        return new Promise<Response>(() => {});
      }
      if (url === "/api/reports/r1") {
        return jsonResponse({
          id: "r1",
          // Schema default on every case; only lawJurisdiction may decide.
          inspection: { id: "i1", propertyCountry: "AU" },
          lawJurisdiction: jurisdiction,
        });
      }
      if (url.includes("/api/user/quick-fill-credits")) {
        return jsonResponse({ hasUnlimited: true, creditsRemaining: 0 });
      }
      if (url === "/api/reports/initial-entry") {
        entryBodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ report: { id: "r1" } });
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function viewerNote(
  which: "cost" | "scope" | "inspection",
): Promise<string> {
  if (which === "cost") {
    render(<CostEstimationViewer reportId="r1" />);
    const button = await screen.findByRole("button", {
      name: "Generate Cost Estimation",
    });
    await act(async () => fireEvent.click(button));
  } else if (which === "scope") {
    render(<ScopeOfWorksViewer reportId="r1" />);
    const button = await screen.findByRole("button", {
      name: "Generate Scope of Works",
    });
    await act(async () => fireEvent.click(button));
  } else {
    // A report with no content auto-starts basic generation.
    render(<InspectionReportViewer reportId="r1" />);
  }
  const note = await screen.findByText(/based on IICRC S500/, undefined, {
    timeout: 3000,
  });
  return note.textContent ?? "";
}

describe("report screens name the job's law while generating (RA-7625)", () => {
  for (const which of ["cost", "scope", "inspection"] as const) {
    it(`${which}: NZ job (default-AU inspection) gets HSWA 2015 and the NZ Building Code`, async () => {
      jurisdiction = "NZ";
      const text = await viewerNote(which);
      expectNz(text);
      expect(text).toContain("HSWA 2015 (WorkSafe NZ)");
      expect(text).toContain("NZ Building Code");
      expect(text).toContain("AS/NZS 3000");
    });

    it(`${which}: AU control still names WHS Regulations 2011 and the NCC`, async () => {
      jurisdiction = "AU";
      const text = await viewerNote(which);
      expect(text).toContain("WHS Regulations 2011");
      expect(text).toMatch(/\bNCC\b/);
      expect(text).not.toContain("HSWA");
    });
  }

  it("unknown jurisdiction names no statute, as generation fails closed", async () => {
    jurisdiction = "unknown";
    const text = await viewerNote("cost");
    expect(text).toContain(
      "the applicable work health and safety legislation, the applicable building code, and AS/NZS 3000",
    );
    expect(text).not.toMatch(/WHS Regulations|\bNCC\b|HSWA|NZ Building Code/);
  });
});

const USE_CASES = [
  "Residential Water Damage",
  "Commercial Water Damage",
  "Mould Remediation",
  "Storm Damage - Roof Leak",
  "Flood Damage - Category 3",
];
// Stable references: the form re-seeds itself whenever initialData changes.
const NZ_JOB = { lawJurisdiction: "NZ" };
const AU_JOB = { lawJurisdiction: "AU" };
const UNKNOWN_JOB = { lawJurisdiction: "unknown" };

async function quickFillInstructions(
  job: { lawJurisdiction: string },
  useCase: string,
): Promise<string> {
  const { container, unmount } = render(
    <InitialDataEntryForm initialData={job} />,
  );
  const button = await screen.findByRole("button", {
    name: /Quick Fill Test Data/,
  });
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => fireEvent.click(button));
  await act(async () => fireEvent.click(await screen.findByText(useCase)));
  await waitFor(() =>
    expect(screen.getAllByDisplayValue(/./).length).toBeGreaterThan(0),
  );
  await act(async () => fireEvent.submit(container.querySelector("form")!));
  await waitFor(() => expect(entryBodies).toHaveLength(1));
  const instructions = String(entryBodies[0].reportInstructions ?? "");
  unmount();
  entryBodies = [];
  return instructions;
}

describe("quick-fill report instructions sent to generation (RA-7625)", () => {
  for (const useCase of USE_CASES) {
    it(`${useCase}: NZ job names NZ law, AU control names AU law`, async () => {
      const nz = await quickFillInstructions(NZ_JOB, useCase);
      expect(nz).toContain("per IICRC");
      expectNz(nz);

      const au = await quickFillInstructions(AU_JOB, useCase);
      expect(au).toMatch(/WHS Regulations|\bNCC\b/);
      expect(au).not.toContain("HSWA");
    });
  }

  it("unknown jurisdiction sends no statute into generation", async () => {
    const text = await quickFillInstructions(
      UNKNOWN_JOB,
      "Residential Water Damage",
    );
    expect(text).toContain("the applicable work health and safety legislation");
    expect(text).not.toMatch(/WHS Regulations|\bNCC\b|HSWA|NZ Building Code/);
  });
});
