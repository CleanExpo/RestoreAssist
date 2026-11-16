// @vitest-environment jsdom
/**
 * RA-8388 - a refusal, or a save that does not count, must be visible.
 *
 * The capture page is the only caller of DELETE /evidence and of the signed
 * photograph upload. Three answers from the server used to be invisible on
 * it:
 *
 * 1. DELETE 409. The route explains why signed evidence behind a reading
 *    stays on the record and what to do instead. The page threw that away
 *    and showed "Failed to delete evidence", so the technician tried again
 *    and got the same nothing.
 * 2. A photograph that is saved but does not count toward the photographs
 *    the job needs (`countsTowardSubmission: false`). The page showed the
 *    same success toast as a counted one.
 * 3. The duplicate answer (`alreadyRecorded: true`). The record it returns is
 *    one the job already holds, and the page added it to the list a second
 *    time, so one reading looked like two.
 *
 * These render the real page. Signing, the file picker and the readback are
 * mocked at their module seams; the page's own handlers are not.
 */
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `toast(...)` itself is the neutral notice; `.success` and `.error` are the
// green and red ones. All three are spied on, so a test can say which one a
// message went to.
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
);
vi.mock("react-hot-toast", () => ({ default: toast }));
// Stable objects: the page lists the router in an effect's dependencies, so
// a new object on every render would reload the workflow for ever.
const stable = vi.hoisted(() => ({
  router: { push: () => {}, replace: () => {}, refresh: () => {} },
  session: { data: { user: { id: "user_1" } } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => stable.router }));
vi.mock("next-auth/react", () => ({ useSession: () => stable.session }));
vi.mock("@/components/providers/CapacitorProvider", () => ({
  useCapacitor: () => ({ isNative: false }),
}));
vi.mock("@/components/ConfirmDialog", () => ({
  useConfirmDialog: () => ({ ask: vi.fn(), Mount: () => null }),
}));
vi.mock("@/lib/offline/inspection-store", () => ({
  getQueuedDraftCount: vi.fn(async () => 0),
}));
vi.mock("@/components/inspections/adaptive-guidance-panel", () => ({
  AdaptiveGuidancePanel: () => null,
}));
vi.mock("@/components/inspections/submission-gate-panel", () => ({
  SubmissionGatePanel: () => null,
}));
vi.mock("@/components/inspections/field-evidence-checklist-panel", () => ({
  FieldEvidenceChecklistPanel: () => null,
}));
vi.mock("@/lib/evidence/ios-capture", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/evidence/ios-capture")>();
  const capture = {
    blob: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
    filename: "photo.jpg",
    manifest: { sha256: "a".repeat(64), capturedAt: "2026-11-16T00:00:00.000Z" },
  };
  return {
    ...actual,
    pickEvidencePhotoFile: vi.fn(
      async () => new File(["jpeg-bytes"], "photo.jpg", { type: "image/jpeg" }),
    ),
    evidencePhotoFromFile: vi.fn(async () => capture),
    buildEvidenceFormData: vi.fn(() => new FormData()),
    evidenceIdempotencyKey: vi.fn(async () => "idem-key-1"),
  };
});
vi.mock("@/lib/evidence/device-signing", () => ({
  ensureDeviceKeyRegistered: vi.fn(async () => ({ keyId: "key-1" })),
  recoverFromRejectedKey: vi.fn(async () => undefined),
  createSignedManifest: vi.fn(async () => ({
    manifestJson: "{}",
    signature: "sig",
  })),
}));
vi.mock("@/lib/evidence/verified-readback", () => ({
  verifyEvidenceReadback: vi.fn(
    async (_inspectionId: string, stepId: string, evidenceId: string) =>
      evidenceRow(evidenceId, "PHOTO_DAMAGE", stepId),
  ),
}));
// The metadata form has its own tests. Here it is a button that reports the
// server's answer, so the page's `onSaved` is what is under test.
const savedAnswer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/components/evidence/metadata-capture-form", () => ({
  MetadataCaptureForm: (props: {
    onSaved: (result: unknown) => void;
    onClose: () => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        props.onSaved({
          ok: true,
          status: 200,
          data: savedAnswer.current,
          idempotencyKey: "k",
          mayHaveSaved: false,
        });
        props.onClose();
      }}
    >
      stub: server answered
    </button>
  ),
}));

import CaptureWorkflowPage from "../page";

const STEP_ID = "step_1";

function evidenceRow(id: string, evidenceClass: string, stepId = STEP_ID) {
  return {
    id,
    evidenceClass,
    workflowStepId: stepId,
    capturedByName: `Captured by ${id}`,
    capturedAt: "2026-11-16T01:00:00.000Z",
    capturedLat: null,
    capturedLng: null,
    deviceType: "WEB_BROWSER",
    fileUrl: "https://files.example/photo.jpg",
    fileMimeType: "image/jpeg",
    thumbnailUrl: null,
    notes: null,
    isVerified: false,
  };
}

function workflowBody(evidenceItems: unknown[]) {
  return {
    workflow: {
      id: "wf_1",
      jobType: "WATER_DAMAGE",
      experienceLevel: "EXPERIENCED",
      currentStepOrder: 1,
      totalSteps: 1,
      completedSteps: 0,
      skippedSteps: 0,
      isReadyToSubmit: false,
      submissionScore: null,
      steps: [
        {
          id: STEP_ID,
          stepOrder: 1,
          stepKey: "moisture_survey",
          stepTitle: "Moisture survey",
          stepDescription: null,
          stepDescriptionShort: null,
          requiredEvidenceClasses: JSON.stringify([
            "PHOTO_DAMAGE",
            "MOISTURE_READING",
          ]),
          optionalEvidenceClasses: null,
          minimumEvidenceCount: 1,
          isMandatory: true,
          riskTier: 1,
          escalationNote: null,
          status: "IN_PROGRESS",
        },
      ],
      evidenceItems,
    },
  };
}

type Answer = { status: number; body: unknown };

function json({ status, body }: Answer) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function renderPage(opts: {
  evidenceItems: unknown[];
  onDelete?: Answer;
  onUpload?: Answer;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/workflow")) {
        return json({ status: 200, body: workflowBody(opts.evidenceItems) });
      }
      if (url.endsWith("/evidence") && method === "DELETE") {
        return json(opts.onDelete ?? { status: 200, body: { ok: true } });
      }
      if (url.endsWith("/evidence") && method === "POST") {
        return json(
          opts.onUpload ?? {
            status: 201,
            body: { evidenceItem: evidenceRow("ev_new", "PHOTO_DAMAGE") },
          },
        );
      }
      if (/\/api\/inspections\/[^/]+$/.test(url)) {
        return json({
          status: 200,
          body: {
            inspection: {
              inspectionNumber: "NIR-TEST-1",
              propertyAddress: "1 Test St",
              status: "DRAFT",
            },
          },
        });
      }
      return json({ status: 200, body: {} });
    }),
  );
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <CaptureWorkflowPage params={Promise.resolve({ id: "insp_1" })} />
      </Suspense>,
    );
  });
  await screen.findByText(/Required Evidence/);
}

/** The Capture button inside the tile for one evidence class. */
function captureButtonFor(label: string): HTMLElement {
  let node: HTMLElement | null = screen.getByText(label);
  while (node) {
    const button = Array.from(node.querySelectorAll("button")).find((b) =>
      /capture|add another/i.test(b.textContent ?? ""),
    );
    if (button) return button as HTMLElement;
    node = node.parentElement;
  }
  throw new Error(`no Capture button found for ${label}`);
}

/** The remove control on the evidence row captured by `name`. */
function removeButtonFor(name: string): HTMLElement {
  const row = screen.getByText(name).parentElement?.parentElement;
  const button = row?.querySelector("button");
  if (!button) throw new Error(`no remove control found beside ${name}`);
  return button as HTMLElement;
}

beforeEach(() => {
  toast.mockClear();
  toast.error.mockClear();
  toast.success.mockClear();
  savedAnswer.current = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a refused delete says why", () => {
  const REFUSAL =
    "This evidence is the signed record behind a moisture reading on this job, so it stays on the record and cannot be deleted. Capture the correct reading again in Guided Capture.";

  it("shows the server's own message, not a generic failure", async () => {
    await renderPage({
      evidenceItems: [evidenceRow("ev_signed", "MOISTURE_READING")],
      onDelete: {
        status: 409,
        body: { error: { code: "CONFLICT", message: REFUSAL, eventId: "e1" } },
      },
    });

    await act(async () => {
      fireEvent.click(removeButtonFor("Captured by ev_signed"));
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(REFUSAL));
    expect(toast.error).not.toHaveBeenCalledWith("Failed to delete evidence");
    // The record is still on the job, so it is still on the screen.
    expect(screen.getByText("Captured by ev_signed")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("falls back to plain words when the refusal carries no message", async () => {
    await renderPage({
      evidenceItems: [evidenceRow("ev_signed", "MOISTURE_READING")],
      onDelete: { status: 500, body: {} },
    });

    await act(async () => {
      fireEvent.click(removeButtonFor("Captured by ev_signed"));
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to delete evidence"),
    );
  });
});

describe("a photograph that is saved but not counted says so", () => {
  it("does not show the plain success toast when the server says it does not count", async () => {
    await renderPage({
      evidenceItems: [],
      onUpload: {
        status: 201,
        body: {
          evidenceItem: evidenceRow("ev_new", "PHOTO_DAMAGE"),
          countsTowardSubmission: false,
        },
      },
    });

    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });

    // Wait for the upload to finish: the saved photograph is on the screen.
    await screen.findByText("Captured by ev_new");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(String(toast.mock.calls[0][0])).toBe(
      "Damage Photo saved, but it does not count toward the photos this job needs.",
    );
  });

  it("shows the ordinary success toast when the photograph counts", async () => {
    await renderPage({
      evidenceItems: [],
      onUpload: {
        status: 201,
        body: {
          evidenceItem: evidenceRow("ev_new", "PHOTO_DAMAGE"),
          countsTowardSubmission: true,
        },
      },
    });

    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Damage Photo captured"),
    );
  });

  it("treats a body without the flag as counted", async () => {
    await renderPage({ evidenceItems: [] });

    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Damage Photo captured"),
    );
  });
});

describe("a refused upload says why, whichever shape the refusal has", () => {
  it("shows a refusal the server sent as a plain string", async () => {
    // The tenancy check and the idempotency wrapper answer `{ error: "..." }`.
    await renderPage({
      evidenceItems: [],
      onUpload: {
        status: 400,
        body: { error: "Idempotency-Key must be 255 characters or fewer." },
      },
    });

    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Idempotency-Key must be 255 characters or fewer.",
      ),
    );
  });

  it("shows a refusal sent in the error envelope", async () => {
    await renderPage({
      evidenceItems: [],
      onUpload: {
        status: 400,
        body: {
          error: {
            code: "VALIDATION",
            message: "Hash mismatch — file may have been tampered with in transit",
          },
        },
      },
    });

    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Hash mismatch — file may have been tampered with in transit",
      ),
    );
  });
});

describe("the duplicate answer is shown as saved, once", () => {
  it("does not add a second copy of a reading the list already holds", async () => {
    const existing = evidenceRow("ev_dup", "MOISTURE_READING");
    await renderPage({ evidenceItems: [existing] });
    savedAnswer.current = { evidenceItem: existing, alreadyRecorded: true };

    await act(async () => {
      fireEvent.click(captureButtonFor("Moisture Reading"));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText("stub: server answered"));
    });

    expect(screen.getAllByText("Captured by ev_dup")).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Moisture Reading was already saved. It is on the job once.",
    );
  });

  it("adds the record when the first answer was lost and the list does not hold it yet", async () => {
    await renderPage({ evidenceItems: [] });
    savedAnswer.current = {
      evidenceItem: evidenceRow("ev_dup", "MOISTURE_READING"),
      alreadyRecorded: true,
    };

    await act(async () => {
      fireEvent.click(captureButtonFor("Moisture Reading"));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText("stub: server answered"));
    });

    expect(screen.getAllByText("Captured by ev_dup")).toHaveLength(1);
  });

  it("an ordinary save still adds the record and says captured", async () => {
    await renderPage({ evidenceItems: [] });
    savedAnswer.current = {
      evidenceItem: evidenceRow("ev_fresh", "MOISTURE_READING"),
    };

    await act(async () => {
      fireEvent.click(captureButtonFor("Moisture Reading"));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText("stub: server answered"));
    });

    expect(screen.getAllByText("Captured by ev_fresh")).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith("Moisture Reading captured");
  });
});
