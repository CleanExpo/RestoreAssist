// @vitest-environment jsdom
/**
 * RA-8388 - the link in a refused submit lands on the open Add Area form.
 *
 * When a job is submitted with no affected area, the capture page shows a
 * link, "Add an affected area", to `?tab=areas&addArea=1`
 * (lib/evidence/submit-refusal.ts). The inspection page reads those two
 * query parameters and opens the form, so the technician lands on the thing
 * they were sent to do and not on a tab with a button to find.
 *
 * WHAT IS RENDERED. The real inspection page component, with its own state,
 * its own effects (the one that reads `tab` and the one that reads
 * `addArea`), its own tab bar, and its own Affected Areas tab and Add Area
 * form markup. The UI kit components (`components/ui`) are real.
 *
 * WHAT IS NOT RENDERED. Every panel the page imports from
 * `components/inspection`, `components/inspections`, `components/sketch`,
 * `components/live-teacher` and the other feature folders is replaced by
 * nothing, as is everything loaded through `next/dynamic`. The router, the
 * session, the toast and the confirm dialog are stand-ins. The network is a
 * fake `fetch` that answers the job with one fixture and everything else
 * with an empty body. The form is opened, not submitted.
 */
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const stable = vi.hoisted(() => ({
  router: { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} },
  session: { data: { user: { id: "user_1", role: "USER" } } },
  nothing: () => null,
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => stable.router }));
vi.mock("next-auth/react", () => ({ useSession: () => stable.session }));
vi.mock("next/dynamic", () => ({ default: () => stable.nothing }));
vi.mock("@/components/ConfirmDialog", () => ({
  useConfirmDialog: () => ({ ask: vi.fn(), Mount: stable.nothing }),
}));

vi.mock("@/components/pricing/BlockedPricingNotice", () => ({ BlockedPricingNotice: stable.nothing }));
vi.mock("@/components/dashboard/DetailLoadErrorPanel", () => ({
  DetailLoadErrorPanel: () => <p>stub: the job did not load</p>,
}));
vi.mock("@/components/inspection/AssignTechnician", () => ({ AssignTechnician: stable.nothing }));
vi.mock("@/components/attestation/EngagementLicenceModal", () => ({ EngagementLicenceModal: stable.nothing }));
vi.mock("@/components/inspection/MoistureMappingCanvas", () => ({ default: stable.nothing }));
vi.mock("@/components/nir-pilot-survey", () => ({ NirPilotSurvey: stable.nothing }));
vi.mock("@/components/mobile/MobileNav", () => ({ MobileNav: stable.nothing }));
vi.mock("@/components/inspection/CapturePhotoFab", () => ({ CapturePhotoFab: stable.nothing }));
vi.mock("@/components/inspection/InspectionPhotoUploadControl", () => ({ InspectionPhotoUploadControl: stable.nothing }));
vi.mock("@/components/inspection/EvidenceQueueRecovery", () => ({ EvidenceQueueRecovery: stable.nothing }));
vi.mock("@/components/inspection/InspectionEvidenceReadinessPanel", () => ({ default: stable.nothing }));
vi.mock("@/components/inspection/HandoverPackagePanel", () => ({ default: stable.nothing }));
vi.mock("@/components/inspection/MakeSafeChecklist", () => ({ MakeSafeChecklist: stable.nothing }));
vi.mock("@/components/inspection/ClaimContextBanner", () => ({ ClaimContextBanner: stable.nothing }));
vi.mock("@/components/inspection/JobAppointmentsPanel", () => ({ JobAppointmentsPanel: stable.nothing }));
vi.mock("@/components/inspection/FieldAssistPanel", () => ({ FieldAssistPanel: stable.nothing }));
vi.mock("@/components/inspection/InspectionWorkflowStrip", () => ({ InspectionWorkflowStrip: stable.nothing }));
vi.mock("@/components/inspection/InspectionWorkspaceLinks", () => ({ InspectionWorkspaceLinks: stable.nothing }));
vi.mock("@/components/inspection/InspectionJourneyGuide", () => ({ InspectionJourneyGuide: stable.nothing }));
vi.mock("@/components/inspection/SketchRoomCoveragePanel", () => ({ SketchRoomCoveragePanel: stable.nothing }));
vi.mock("@/components/inspection/SketchMeasurementChecklistLoader", () => ({ SketchMeasurementChecklistLoader: stable.nothing }));
vi.mock("@/components/inspection/FloorPlanFieldGuide", () => ({ FloorPlanFieldGuide: stable.nothing }));
vi.mock("@/components/inspection/EnvironmentalSummary", () => ({ default: stable.nothing }));
vi.mock("@/components/inspection/InspectionSignOff", () => ({ default: stable.nothing }));
vi.mock("@/components/inspections/field-evidence-checklist-panel", () => ({ FieldEvidenceChecklistPanel: stable.nothing }));
vi.mock("@/components/inspection/GroupReadingsPanel", () => ({ GroupReadingsPanel: stable.nothing }));
vi.mock("@/components/inspection/MeterPhotoCapture", () => ({ MeterPhotoCapture: stable.nothing }));
vi.mock("@/components/inspection/InsurerProfilePanel", () => ({ InsurerProfilePanel: stable.nothing }));
vi.mock("@/components/live-teacher/VoiceAssistant", () => ({ VoiceAssistant: stable.nothing }));
vi.mock("@/components/live-teacher/InspectionSidekick", () => ({ InspectionSidekick: stable.nothing }));

import InspectionDetailPage from "../page";

const JOB_ID = "insp_1";

const inspection = {
  id: JOB_ID,
  inspectionNumber: "NIR-TEST-1",
  propertyAddress: "1 Test St",
  propertyPostcode: "4000",
  technicianName: "Test Technician",
  technicianId: "user_1",
  userId: "user_1",
  status: "DRAFT",
  inspectionDate: "2026-11-16T00:00:00.000Z",
  createdAt: "2026-11-16T00:00:00.000Z",
  submittedAt: null,
  processedAt: null,
  signedAt: null,
  signedByName: null,
  claimType: "WATER_DAMAGE",
  completedAt: null,
  closeSummary: null,
  closePackageStorageKey: null,
  handoverCompletedAt: null,
  handoverPackageStorageKey: null,
  pulseEnabled: false,
  reportId: null,
  clientId: null,
  environmentalData: null,
  moistureReadings: [],
  affectedAreas: [],
  scopeItems: [],
  classifications: [],
  costEstimates: [],
  photos: [],
  auditLogs: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function renderJobPageAt(search: string) {
  window.history.replaceState({}, "", `/dashboard/inspections/${JOB_ID}${search}`);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith(`/api/inspections/${JOB_ID}`)
        ? json({ inspection })
        : json({}),
    ),
  );
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <InspectionDetailPage params={Promise.resolve({ id: JOB_ID })} />
      </Suspense>,
    );
  });
  // The job has loaded: its Affected Areas tab or its tab bar is on screen.
  await screen.findByText("NIR-TEST-1", { exact: false });
}

/** The first field of the Add Area form; on screen only while it is open. */
const ADD_AREA_FIELD = "Room / Zone ID *";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("the refused-submit link opens the Add Area form", () => {
  it("opens the Affected Areas tab with the Add Area form open for ?tab=areas&addArea=1", async () => {
    await renderJobPageAt("?tab=areas&addArea=1");

    expect(
      await screen.findByRole("heading", { name: "Affected Areas (0)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(ADD_AREA_FIELD)).toBeInTheDocument();
  });

  it("opens the tab with the form shut for ?tab=areas alone", async () => {
    await renderJobPageAt("?tab=areas");

    expect(
      await screen.findByRole("heading", { name: "Affected Areas (0)" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(ADD_AREA_FIELD)).toBeNull();
  });
});
