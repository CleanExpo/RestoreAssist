// @vitest-environment jsdom
/**
 * RA-8477: the pilot dashboard rendered `claim.hypothesis` as a React child.
 * The readiness API returns the register's EvidenceClaim, whose `hypothesis`
 * is an object, so every visit crashed with "Objects are not valid as a React
 * child". This renders the page with the real report shape from
 * generatePilotReport().
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePilotReport } from "@/lib/nir-pilot-measurement";
import { EVIDENCE_REGISTER } from "@/lib/nir-evidence-architecture";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "admin_1", role: "ADMIN" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
// The command centre has its own tests; this file is about the claim cards.
vi.mock("@/components/admin/PilotReadinessCommandCentre", () => ({
  PilotReadinessCommandCentre: () => null,
}));

import PilotReadinessDashboard from "../page";

function readiness(report: unknown) {
  return {
    commandCentre: {},
    report,
    cycleTimeSummary: {
      derivedFromInspections: 0,
      companies: 0,
      totalCompletedInspections: 0,
    },
    meta: {
      generatedAt: "2026-11-21T00:00:00.000Z",
      totalObservations: 0,
      manualObservations: 0,
      derivedObservations: 0,
      note: [],
    },
  };
}

function mockFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Admin pilot dashboard claim cards (RA-8477)", () => {
  it("renders claims whose hypothesis is an object without crashing", async () => {
    const report = generatePilotReport([]);
    const claim002 = [...report.readyToPromote, ...report.inProgress].find(
      (r) => r.claim.id === "CLAIM-002",
    );
    // The fixture must carry the object shape that crashed the page.
    expect(typeof claim002?.claim.hypothesis).toBe("object");

    mockFetch(readiness(report));
    render(<PilotReadinessDashboard />);

    const register = EVIDENCE_REGISTER.find((c) => c.id === "CLAIM-002")!;
    expect(await screen.findByText(register.claim)).toBeInTheDocument();
    expect(
      screen.getByText(register.hypothesis!.successCriteria),
    ).toBeInTheDocument();
    expect(
      screen.getByText(register.hypothesis!.measurementMethod),
    ).toBeInTheDocument();
    expect(screen.getByText(register.hypothesis!.sampleSize)).toBeInTheDocument();
  });

  it("still renders a legacy string hypothesis and a claim with none", async () => {
    const report = generatePilotReport([]);
    const [first, second] = [...report.readyToPromote, ...report.inProgress];
    const legacy = {
      ...report,
      readyToPromote: [],
      inProgress: [
        { ...first, claim: { ...first.claim, hypothesis: "Legacy plan text" } },
        { ...second, claim: { ...second.claim, hypothesis: undefined } },
      ],
    };

    mockFetch(readiness(legacy));
    render(<PilotReadinessDashboard />);

    expect(await screen.findByText("Legacy plan text")).toBeInTheDocument();
    expect(screen.getByText(second.claim.claim)).toBeInTheDocument();
  });
});
