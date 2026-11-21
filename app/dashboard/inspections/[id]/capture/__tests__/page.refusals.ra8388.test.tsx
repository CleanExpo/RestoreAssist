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
// RA-8407: a test can put the page on a native device.
const capacitor = vi.hoisted(() => ({ isNative: false }));
vi.mock("@/components/providers/CapacitorProvider", () => ({
  useCapacitor: () => ({ isNative: capacitor.isNative }),
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
// The submit panel is left out unless a test asks for the real one: only the
// refused-submit tests need its Submit button.
const gate = vi.hoisted(() => ({ real: false }));
vi.mock(
  "@/components/inspections/submission-gate-panel",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/inspections/submission-gate-panel")
      >();
    return {
      SubmissionGatePanel: (
        props: Parameters<typeof actual.SubmissionGatePanel>[0],
      ) => (gate.real ? <actual.SubmissionGatePanel {...props} /> : null),
    };
  },
);
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
    captureEvidencePhoto: vi.fn(async () => capture),
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
// Its props are the real form's, so a close reason the form does not have
// fails the type check here.
vi.mock("@/components/evidence/metadata-capture-form", () => ({
  MetadataCaptureForm: (
    props: Pick<MetadataCaptureFormProps, "onSaved" | "onClose">,
  ) => (
    <>
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
          props.onClose("saved");
        }}
      >
        stub: server answered
      </button>
      {/* "Close and check": a send went out and no save was confirmed. */}
      <button
        type="button"
        onClick={() => props.onClose("attempt-not-confirmed-saved")}
      >
        stub: close and check
      </button>
      {/* A plain Cancel: nothing was sent. */}
      <button type="button" onClick={() => props.onClose("no-attempt")}>
        stub: cancel
      </button>
    </>
  ),
}));

import CaptureWorkflowPage from "../page";
import type { MetadataCaptureFormProps } from "@/components/evidence/metadata-capture-form";
import { verifyEvidenceReadback } from "@/lib/evidence/verified-readback";
import {
  captureEvidencePhoto,
  pickEvidencePhotoFile,
} from "@/lib/evidence/ios-capture";
import { AUDIO_EVIDENCE_ACCEPT } from "@/lib/evidence/file-media-kind";

/** RA-8488: every success notice on this page shares one toast id. */
const PROGRESS_TOAST = { id: "capture-progress" };

const STEP_ID = "step_1";
const SECOND_STEP_ID = "step_2";

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

function workflowBody(
  evidenceItems: unknown[],
  isReadyToSubmit = false,
  twoSteps = false,
  requiredClasses: string[] = ["PHOTO_DAMAGE", "MOISTURE_READING"],
) {
  const secondStep = {
    id: SECOND_STEP_ID,
    stepOrder: 2,
    stepKey: "drying_setup",
    stepTitle: "Drying setup",
    stepDescription: null,
    stepDescriptionShort: null,
    requiredEvidenceClasses: JSON.stringify(["MOISTURE_READING"]),
    optionalEvidenceClasses: null,
    minimumEvidenceCount: 1,
    isMandatory: true,
    riskTier: 1,
    escalationNote: null,
    status: "NOT_STARTED",
  };
  return {
    workflow: {
      id: "wf_1",
      jobType: "WATER_DAMAGE",
      experienceLevel: "EXPERIENCED",
      currentStepOrder: 1,
      totalSteps: twoSteps ? 2 : 1,
      completedSteps: 0,
      skippedSteps: 0,
      isReadyToSubmit,
      submissionScore: null,
      steps: [
        {
          id: STEP_ID,
          stepOrder: 1,
          stepKey: "moisture_survey",
          stepTitle: "Moisture survey",
          stepDescription: null,
          stepDescriptionShort: null,
          requiredEvidenceClasses: JSON.stringify(requiredClasses),
          optionalEvidenceClasses: null,
          minimumEvidenceCount: 1,
          isMandatory: true,
          riskTier: 1,
          escalationNote: null,
          status: "IN_PROGRESS",
        },
        ...(twoSteps ? [secondStep] : []),
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
  /**
   * Answers for every GET /workflow after the one at mount, numbered from 0.
   * May return a promise the test settles later, so two answers can be made
   * to arrive out of order.
   */
  onWorkflowReload?: (reload: number) => Response | Promise<Response>;
  /** The job is ready, so the real submit panel shows its Submit button. */
  readyToSubmit?: boolean;
  onSubmit?: Answer;
  /** The job has a second step, "Drying setup" (`drying_setup`). */
  twoSteps?: boolean;
  /** What POST /workflow/validate answers. Defaults to "can submit". */
  validation?: Record<string, unknown>;
  /** Replaces the answer to the photograph POST, for one that never comes. */
  onUploadRequest?: (init?: RequestInit) => Promise<Response>;
  /** The first step's required classes, when a test needs others. */
  requiredClasses?: string[];
}) {
  let workflowLoads = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/workflow")) {
      const load = workflowLoads++;
      if (load > 0 && opts.onWorkflowReload) {
        return opts.onWorkflowReload(load - 1);
      }
      return json({
        status: 200,
        body: workflowBody(
          opts.evidenceItems,
          opts.readyToSubmit,
          opts.twoSteps,
          opts.requiredClasses,
        ),
      });
    }
    if (url.endsWith("/workflow/validate")) {
      return json({
        status: 200,
        body: {
          validation: opts.validation ?? {
            canSubmit: true,
            score: 100,
            blockingGaps: [],
            warningGaps: [],
            totalSteps: 1,
            completedSteps: 1,
          },
        },
      });
    }
    if (url.endsWith("/submit") && method === "POST") {
      return json(opts.onSubmit ?? { status: 200, body: { ok: true } });
    }
    if (url.endsWith("/evidence") && method === "DELETE") {
      return json(opts.onDelete ?? { status: 200, body: { ok: true } });
    }
    if (url.endsWith("/evidence") && method === "POST") {
      if (opts.onUploadRequest) return opts.onUploadRequest(init);
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
  });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <CaptureWorkflowPage params={Promise.resolve({ id: "insp_1" })} />
      </Suspense>,
    );
  });
  await screen.findByText(/Required Evidence/);
  return fetchMock;
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
  // Walk up from the name to the nearest element holding a button: the row.
  // RA-8488 nested the details line one level deeper.
  let node: HTMLElement | null = screen.getByText(name).parentElement;
  while (node && !node.querySelector("button")) node = node.parentElement;
  const button = node?.querySelector("button");
  if (!button) throw new Error(`no remove control found beside ${name}`);
  return button as HTMLElement;
}

beforeEach(() => {
  toast.mockClear();
  toast.error.mockClear();
  toast.success.mockClear();
  savedAnswer.current = null;
  gate.real = false;
  capacitor.isNative = false;
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
      expect(toast.success).toHaveBeenCalledWith(
        "Damage Photo captured",
        PROGRESS_TOAST,
      ),
    );
  });

  it("treats a body without the flag as counted", async () => {
    await renderPage({ evidenceItems: [] });

    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Damage Photo captured",
        PROGRESS_TOAST,
      ),
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
      PROGRESS_TOAST,
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
    expect(toast.success).toHaveBeenCalledWith(
      "Moisture Reading captured",
      PROGRESS_TOAST,
    );
  });
});

// RA-8488: found in the first browser run of the RA-8388 fix.
describe("RA-8488: the evidence list and the capture notices", () => {
  it("shows what each reading is, so two readings can be told apart", async () => {
    const reading = (id: string, title: string) => ({
      ...evidenceRow(id, "MOISTURE_READING"),
      title,
      fileUrl: null,
      fileMimeType: null,
    });
    await renderPage({
      evidenceItems: [
        reading("ev_a", "Hall wall (Plasterboard)"),
        reading("ev_b", "Kitchen floor (Timber)"),
      ],
    });

    expect(screen.getByText("Hall wall (Plasterboard)")).toBeInTheDocument();
    expect(screen.getByText("Kitchen floor (Timber)")).toBeInTheDocument();
  });

  // The first browser run of this fix showed the title cut to "Syntheti..."
  // on a 390 px phone: it sat in the details line, which truncates. It must
  // be its own line that wraps, and never truncated.
  it("puts the title on its own wrapping line, not in the truncated details line", async () => {
    await renderPage({
      evidenceItems: [
        {
          ...evidenceRow("ev_a", "MOISTURE_READING"),
          title: "Synthetic hall wall 1 (Plasterboard)",
          fileUrl: null,
          fileMimeType: null,
        },
      ],
    });

    const title = screen.getByText("Synthetic hall wall 1 (Plasterboard)");
    expect(title).toHaveAttribute("data-testid", "evidence-record-title");
    expect(title.className).not.toMatch(/\btruncate\b/);
    expect(title.className).toMatch(/\bbreak-words\b/);
    // Not a sibling of the capturer's name in the details line.
    expect(title.parentElement).not.toBe(
      screen.getByText("Captured by ev_a").parentElement,
    );
  });

  it("does not repeat the class name as a title when the record has no title of its own", async () => {
    await renderPage({
      evidenceItems: [
        {
          ...evidenceRow("ev_c", "MOISTURE_READING"),
          title: "MOISTURE_READING",
          fileUrl: null,
          fileMimeType: null,
        },
      ],
    });

    expect(screen.queryByText("MOISTURE_READING")).toBeNull();
    expect(screen.getByText("Captured by ev_c")).toBeInTheDocument();
  });

  it("each new capture notice replaces the last one instead of stacking", async () => {
    await renderPage({ evidenceItems: [] });
    for (const id of ["ev_1", "ev_2"]) {
      savedAnswer.current = { evidenceItem: evidenceRow(id, "MOISTURE_READING") };
      await act(async () => {
        fireEvent.click(captureButtonFor("Moisture Reading"));
      });
      await act(async () => {
        fireEvent.click(await screen.findByText("stub: server answered"));
      });
    }

    const calls = toast.success.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call[1]).toEqual(PROGRESS_TOAST);
  });
});

/**
 * Spec 2b section 5: "On the capture page a refused submit is shown in plain
 * words with a link to where each missing item is fixed". The wording has
 * its own tests (lib/evidence/__tests__/submit-refusal.test.ts); these render
 * the page, with the real submit panel, so the screen that shows it is under
 * test too. The page used to toast the raw server code and nothing else.
 */
describe("a refused submit is shown in plain words on the page", () => {
  async function submitRefusedWith(onSubmit: Answer) {
    gate.real = true;
    const fetchMock = await renderPage({
      evidenceItems: [],
      readyToSubmit: true,
      onSubmit,
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: /Submit Inspection/ }),
      );
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/submit") && init?.method === "POST",
        ),
      ).toBe(true),
    );
  }

  it("names the missing affected area and links to where it is added", async () => {
    await submitRefusedWith({
      status: 422,
      body: { error: "MISSING_AFFECTED_AREAS" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "One thing is missing before this inspection can be submitted.",
    );
    expect(alert).toHaveTextContent(
      "No affected area has been added to this job",
    );
    expect(
      screen.getByRole("link", { name: "Add an affected area" }),
    ).toHaveAttribute(
      "href",
      "/dashboard/inspections/insp_1?tab=areas&addArea=1",
    );
    // The raw code is on the screen nowhere, and in no toast.
    expect(document.body.textContent ?? "").not.toContain("MISSING_");
    for (const [message] of [...toast.error.mock.calls, ...toast.mock.calls]) {
      expect(String(message)).not.toContain("MISSING_");
    }
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not show a code it has no words for", async () => {
    await submitRefusedWith({
      status: 422,
      body: { error: "SOME_NEW_CODE" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "This inspection could not be submitted. Please try again.",
    );
    expect(document.body.textContent ?? "").not.toContain("SOME_NEW_CODE");
    for (const [message] of toast.error.mock.calls) {
      expect(String(message)).not.toContain("SOME_NEW_CODE");
    }
  });
});

/**
 * When a save may already have been recorded the form says "Close this and
 * check the step's evidence before entering it again." The page loaded the
 * list once, at mount, so the check showed the list from before the save and
 * the reading was entered a second time.
 */
describe("closing the form shows what the job holds now", () => {
  const NOT_REFRESHED =
    "Could not refresh this step's evidence. Reload the page to see what is saved before entering it again.";

  /** GET /workflow answers the test settles when it chooses. */
  function deferredReloads() {
    const settle: Array<(response: Response) => void> = [];
    const onWorkflowReload = () =>
      new Promise<Response>((resolve) => {
        settle.push(resolve);
      });
    return { settle, onWorkflowReload };
  }

  function listAnswer(evidenceItems: unknown[]) {
    return json({ status: 200, body: workflowBody(evidenceItems) });
  }

  /** Open the reading form and close it as "Close and check" does. */
  async function openFormAndClose(how = "stub: close and check") {
    await act(async () => {
      fireEvent.click(captureButtonFor("Moisture Reading"));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText(how));
    });
  }

  function workflowLoadCount(fetchMock: { mock: { calls: unknown[][] } }) {
    return fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/workflow"),
    ).length;
  }

  // RA-8388 gap 1. Every close used to reload, so a plain Cancel with no
  // connection told the technician the step's evidence could not be
  // refreshed, about an entry that was never sent.
  it("does not reload, and says nothing, after a plain Cancel with no connection", async () => {
    const fetchMock = await renderPage({
      evidenceItems: [evidenceRow("ev_kept", "MOISTURE_READING")],
      onWorkflowReload: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    expect(workflowLoadCount(fetchMock)).toBe(1);

    await openFormAndClose("stub: cancel");
    // Give a reload, if one was wrongly sent, time to fail and say so.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(workflowLoadCount(fetchMock)).toBe(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText("Checking what was saved...")).toBeNull();
    expect(captureButtonFor("Moisture Reading")).toBeEnabled();
    expect(screen.getByText("Captured by ev_kept")).toBeInTheDocument();
  });

  it("shows a reading the server recorded while the form was open", async () => {
    const fetchMock = await renderPage({
      evidenceItems: [],
      onWorkflowReload: () =>
        listAnswer([evidenceRow("ev_committed", "MOISTURE_READING")]),
    });
    expect(screen.queryByText("Captured by ev_committed")).toBeNull();

    await openFormAndClose();

    expect(
      await screen.findByText("Captured by ev_committed"),
    ).toBeInTheDocument();
    // Evidence only: the job itself is not loaded again, so the open step
    // and the rest of the page stay as they were.
    const jobLoads = fetchMock.mock.calls.filter(([url]) =>
      /\/api\/inspections\/[^/]+$/.test(String(url)),
    );
    expect(jobLoads).toHaveLength(1);
    expect(screen.getByText(/Required Evidence/)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the newer list when an older reload answers last", async () => {
    // Two reloads in flight at once. The reading form cannot be reopened on
    // a step that is still being checked, so the second reload comes from
    // the same form on the job's other step.
    const { settle, onWorkflowReload } = deferredReloads();
    await renderPage({ evidenceItems: [], onWorkflowReload, twoSteps: true });

    await openFormAndClose();
    await waitFor(() => expect(settle).toHaveLength(1));
    await act(async () => {
      fireEvent.click(screen.getByText("2. Drying setup"));
    });
    await openFormAndClose();
    await waitFor(() => expect(settle).toHaveLength(2));
    await act(async () => {
      fireEvent.click(screen.getByText("1. Moisture survey"));
    });

    await act(async () => {
      settle[1](
        listAnswer([
          evidenceRow("ev_first", "MOISTURE_READING"),
          evidenceRow("ev_second", "MOISTURE_READING"),
        ]),
      );
    });
    await screen.findByText("Captured by ev_second");
    await act(async () => {
      settle[0](listAnswer([evidenceRow("ev_first", "MOISTURE_READING")]));
    });

    expect(screen.getByText("Captured by ev_second")).toBeInTheDocument();
    expect(screen.getAllByText("Captured by ev_first")).toHaveLength(1);
  });

  it("does not let a late reload remove a photograph saved after it was sent", async () => {
    // The save is a photograph: the reading form stays shut on this step
    // while the reload is out, and a photograph is still allowed.
    const { settle, onWorkflowReload } = deferredReloads();
    await renderPage({ evidenceItems: [], onWorkflowReload });

    await openFormAndClose();
    await waitFor(() => expect(settle).toHaveLength(1));

    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });
    await screen.findByText("Captured by ev_new");

    // The reload was sent before the save, so its list does not hold it.
    await act(async () => {
      settle[0](listAnswer([]));
    });

    expect(screen.getByText("Captured by ev_new")).toBeInTheDocument();
    // The overtaken answer is asked for again, and that one is used.
    await waitFor(() => expect(settle).toHaveLength(2));
    await act(async () => {
      settle[1](listAnswer([evidenceRow("ev_new", "PHOTO_DAMAGE")]));
    });
    expect(screen.getAllByText("Captured by ev_new")).toHaveLength(1);
  });

  it("does not let a late reload bring back a record deleted after it was sent", async () => {
    const { settle, onWorkflowReload } = deferredReloads();
    const existing = evidenceRow("ev_gone", "MOISTURE_READING");
    await renderPage({ evidenceItems: [existing], onWorkflowReload });

    await openFormAndClose();
    await waitFor(() => expect(settle).toHaveLength(1));

    await act(async () => {
      fireEvent.click(removeButtonFor("Captured by ev_gone"));
    });
    await waitFor(() =>
      expect(screen.queryByText("Captured by ev_gone")).toBeNull(),
    );

    await act(async () => {
      settle[0](listAnswer([existing]));
    });

    expect(screen.queryByText("Captured by ev_gone")).toBeNull();
    // The overtaken answer is asked for again; answer it so nothing is left
    // waiting when the test ends.
    await waitFor(() => expect(settle).toHaveLength(2));
    await act(async () => {
      settle[1](listAnswer([]));
    });
    expect(screen.queryByText("Captured by ev_gone")).toBeNull();
  });

  it("keeps the working picture link of a photograph the list already shows", async () => {
    // A photograph taken in this session is held with the signed link the
    // evidence listing gave it. The reload reads the workflow route, which
    // returns the stored link; for a private file that link shows nothing.
    const SIGNED = "https://files.example/private/ev_photo.jpg?token=signed";
    const STORED = "https://files.example/private/ev_photo.jpg";
    vi.mocked(verifyEvidenceReadback).mockResolvedValueOnce({
      ...evidenceRow("ev_photo", "PHOTO_DAMAGE"),
      fileUrl: SIGNED,
    });
    await renderPage({
      evidenceItems: [],
      onWorkflowReload: () =>
        listAnswer([
          evidenceRow("ev_committed", "MOISTURE_READING"),
          { ...evidenceRow("ev_photo", "PHOTO_DAMAGE"), fileUrl: STORED },
        ]),
    });
    await act(async () => {
      fireEvent.click(captureButtonFor("Damage Photo"));
    });
    await screen.findByText("Captured by ev_photo");

    await openFormAndClose();
    await screen.findByText("Captured by ev_committed");

    const pictures = Array.from(document.querySelectorAll("img")).map((img) =>
      img.getAttribute("src"),
    );
    expect(pictures).toContain(SIGNED);
    expect(pictures).not.toContain(STORED);
    expect(screen.getAllByText("Captured by ev_photo")).toHaveLength(1);
  });

  it("keeps the list and says so when the reload fails", async () => {
    await renderPage({
      evidenceItems: [evidenceRow("ev_kept", "MOISTURE_READING")],
      onWorkflowReload: () => json({ status: 500, body: {} }),
    });

    await openFormAndClose();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(NOT_REFRESHED),
    );
    expect(screen.getByText("Captured by ev_kept")).toBeInTheDocument();
  });

  it("keeps the list and says so when the connection drops", async () => {
    await renderPage({
      evidenceItems: [evidenceRow("ev_kept", "MOISTURE_READING")],
      onWorkflowReload: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    await openFormAndClose();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(NOT_REFRESHED),
    );
    expect(screen.getByText("Captured by ev_kept")).toBeInTheDocument();
  });

  it("does not blank the list when the answer carries no evidence list", async () => {
    await renderPage({
      evidenceItems: [evidenceRow("ev_kept", "MOISTURE_READING")],
      onWorkflowReload: () => json({ status: 200, body: { workflow: null } }),
    });

    await openFormAndClose();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(NOT_REFRESHED),
    );
    expect(screen.getByText("Captured by ev_kept")).toBeInTheDocument();
  });

  /**
   * RA-8388 gap 2. "Close and check" is only safe if the technician cannot
   * enter the reading again before the check has answered. On a slow
   * connection the list was still the old one, the form opened, and the same
   * reading went in twice.
   */
  describe("the step is held while the check is out", () => {
    const CHECKING = "Checking what was saved...";

    afterEach(() => {
      vi.useRealTimers();
    });

    it("says it is checking and keeps the reading form shut until the list has answered", async () => {
      const { settle, onWorkflowReload } = deferredReloads();
      await renderPage({ evidenceItems: [], onWorkflowReload });
      expect(screen.queryByText(CHECKING)).toBeNull();

      await openFormAndClose();
      await waitFor(() => expect(settle).toHaveLength(1));

      expect(screen.getByRole("status")).toHaveTextContent(CHECKING);
      expect(captureButtonFor("Moisture Reading")).toBeDisabled();
      // A photograph is a different path with its own pending state.
      expect(captureButtonFor("Damage Photo")).toBeEnabled();
      await act(async () => {
        fireEvent.click(captureButtonFor("Moisture Reading"));
      });
      expect(screen.queryByText("stub: server answered")).toBeNull();

      await act(async () => {
        settle[0](listAnswer([evidenceRow("ev_committed", "MOISTURE_READING")]));
      });

      await screen.findByText("Captured by ev_committed");
      expect(screen.queryByText(CHECKING)).toBeNull();
      expect(captureButtonFor("Moisture Reading")).toBeEnabled();
      await act(async () => {
        fireEvent.click(captureButtonFor("Moisture Reading"));
      });
      expect(await screen.findByText("stub: server answered")).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("lets go, with the reload-the-page notice, when the check fails", async () => {
      const { settle, onWorkflowReload } = deferredReloads();
      await renderPage({
        evidenceItems: [evidenceRow("ev_kept", "MOISTURE_READING")],
        onWorkflowReload,
      });

      await openFormAndClose();
      await waitFor(() => expect(settle).toHaveLength(1));
      expect(screen.getByRole("status")).toHaveTextContent(CHECKING);

      await act(async () => {
        settle[0](json({ status: 500, body: {} }));
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(NOT_REFRESHED),
      );
      expect(screen.queryByText(CHECKING)).toBeNull();
      expect(captureButtonFor("Moisture Reading")).toBeEnabled();
      expect(screen.getByText("Captured by ev_kept")).toBeInTheDocument();
    });

    it("gives up on a check that never answers, so the step is not held for ever", async () => {
      const fetchMock = await renderPage({
        evidenceItems: [evidenceRow("ev_kept", "MOISTURE_READING")],
        onWorkflowReload: () => new Promise<Response>(() => {}),
      });

      // Only the two timer functions the time limit uses. While they are
      // faked this test uses `act` and synchronous queries only.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      await act(async () => {
        fireEvent.click(captureButtonFor("Moisture Reading"));
      });
      await act(async () => {
        fireEvent.click(screen.getByText("stub: close and check"));
      });
      const reloadSignal = fetchMock.mock.calls
        .filter(([url]) => String(url).endsWith("/workflow"))
        .at(-1)?.[1]?.signal;
      expect(screen.getByRole("status")).toHaveTextContent(CHECKING);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(19_999);
      });
      expect(screen.getByRole("status")).toHaveTextContent(CHECKING);
      expect(captureButtonFor("Moisture Reading")).toBeDisabled();
      expect(toast.error).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      vi.useRealTimers();

      expect(toast.error).toHaveBeenCalledWith(NOT_REFRESHED);
      expect(screen.queryByText(CHECKING)).toBeNull();
      expect(captureButtonFor("Moisture Reading")).toBeEnabled();
      expect(screen.getByText("Captured by ev_kept")).toBeInTheDocument();
      // The request that was given up on is cancelled, not left running.
      expect(reloadSignal?.aborted).toBe(true);
    });

    it("checks again, and stays held, when a delete overtakes the check", async () => {
      // The answer left the server before the delete, so it cannot be used.
      // Dropping it and letting go would open the form on a list that was
      // never checked.
      const { settle, onWorkflowReload } = deferredReloads();
      const existing = evidenceRow("ev_gone", "MOISTURE_READING");
      await renderPage({ evidenceItems: [existing], onWorkflowReload });

      await openFormAndClose();
      await waitFor(() => expect(settle).toHaveLength(1));
      await act(async () => {
        fireEvent.click(removeButtonFor("Captured by ev_gone"));
      });
      await waitFor(() =>
        expect(screen.queryByText("Captured by ev_gone")).toBeNull(),
      );

      await act(async () => {
        settle[0](
          listAnswer([existing, evidenceRow("ev_committed", "MOISTURE_READING")]),
        );
      });

      await waitFor(() => expect(settle).toHaveLength(2));
      expect(screen.queryByText("Captured by ev_gone")).toBeNull();
      expect(screen.queryByText("Captured by ev_committed")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(CHECKING);
      expect(captureButtonFor("Moisture Reading")).toBeDisabled();

      await act(async () => {
        settle[1](listAnswer([evidenceRow("ev_committed", "MOISTURE_READING")]));
      });

      await screen.findByText("Captured by ev_committed");
      expect(screen.queryByText("Captured by ev_gone")).toBeNull();
      expect(screen.queryByText(CHECKING)).toBeNull();
      expect(captureButtonFor("Moisture Reading")).toBeEnabled();
    });

    it("holds only the step that was closed, not the job's other step", async () => {
      const { settle, onWorkflowReload } = deferredReloads();
      await renderPage({ evidenceItems: [], onWorkflowReload, twoSteps: true });

      await openFormAndClose();
      await waitFor(() => expect(settle).toHaveLength(1));
      await act(async () => {
        fireEvent.click(screen.getByText("2. Drying setup"));
      });

      expect(screen.queryByText(CHECKING)).toBeNull();
      expect(captureButtonFor("Moisture Reading")).toBeEnabled();

      await act(async () => {
        settle[0](listAnswer([]));
      });
    });
  });
});

/**
 * RA-8388 gap 4b. The submit panel lists what is still missing, and each
 * item is a control that opens the step it belongs to. The panel has its own
 * tests with a spy for the handler; this renders the page, so the handler
 * the page passes - find the step, open it, scroll to the top - is under
 * test.
 */
describe("an item in the issues list opens the step it names", () => {
  it("moves to the named step and scrolls to the top", async () => {
    gate.real = true;
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    await renderPage({
      evidenceItems: [],
      readyToSubmit: true,
      twoSteps: true,
      validation: {
        canSubmit: false,
        score: 40,
        blockingGaps: [
          {
            stepKey: "drying_setup",
            stepTitle: "Drying setup",
            detail: "Needs 1 moisture reading",
            riskTier: 1,
            s500Ref: null,
          },
        ],
        warningGaps: [],
        totalSteps: 2,
        completedSteps: 0,
      },
    });
    // The page opens on the first step.
    expect(
      screen.getByRole("heading", { level: 1, name: "Moisture survey" }),
    ).toBeInTheDocument();

    // The list opens by itself when something blocks the submit.
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: /Go to this step/ }),
      );
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "Drying setup" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "Moisture survey" }),
    ).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});
// RA-8407: a voice memo is a sound recording. The capture screen opened the
// stills camera for it, so the only thing a technician could send under
// "Voice Memo" was a photograph.
describe("a voice memo never opens the stills camera", () => {
  beforeEach(() => {
    vi.mocked(pickEvidencePhotoFile).mockClear();
    vi.mocked(captureEvidencePhoto).mockClear();
  });

  async function tapCapture(label: string) {
    await act(async () => {
      fireEvent.click(captureButtonFor(label));
    });
  }

  it("on the web, opens an audio-only picker", async () => {
    await renderPage({ evidenceItems: [], requiredClasses: ["VOICE_MEMO"] });
    await tapCapture("Voice Memo");
    await waitFor(() => expect(pickEvidencePhotoFile).toHaveBeenCalled());
    const accept = vi.mocked(pickEvidencePhotoFile).mock.calls[0][0]?.accept;
    expect(accept).toBe(AUDIO_EVIDENCE_ACCEPT);
    for (const type of (accept ?? "").split(",")) {
      expect(type.startsWith("audio/")).toBe(true);
    }
  });

  it("on a native device, does not open the native stills camera", async () => {
    capacitor.isNative = true;
    await renderPage({ evidenceItems: [], requiredClasses: ["VOICE_MEMO"] });
    await tapCapture("Voice Memo");
    await waitFor(() => expect(pickEvidencePhotoFile).toHaveBeenCalled());
    expect(captureEvidencePhoto).not.toHaveBeenCalled();
    expect(vi.mocked(pickEvidencePhotoFile).mock.calls[0][0]?.accept).toBe(
      AUDIO_EVIDENCE_ACCEPT,
    );
  });

  it("control: a photograph on a native device still opens the stills camera", async () => {
    capacitor.isNative = true;
    await renderPage({ evidenceItems: [], requiredClasses: ["PHOTO_DAMAGE"] });
    await tapCapture("Damage Photo");
    await waitFor(() => expect(captureEvidencePhoto).toHaveBeenCalled());
    expect(pickEvidencePhotoFile).not.toHaveBeenCalled();
  });
});
