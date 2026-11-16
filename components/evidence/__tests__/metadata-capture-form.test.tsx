// @vitest-environment jsdom
/**
 * RA-8388 criterion `capture-form-draft-identity`.
 *
 * Two client-visible faults are tested here and nowhere else.
 *
 * 1. **Lost typing.** The screen this replaces drove capture through
 *    `window.prompt`, and a blank or cancelled prompt ran
 *    `setSelectedEvidenceClass(null); return;` - everything typed was
 *    discarded with no message. The client reported it as "nothing happens
 *    after I click OK".
 *
 * 2. **The duplicate reading.** `submit-metadata-evidence.ts` derives its
 *    idempotency key from draft content plus `capturedAt`, so replaying ONE
 *    draft is idempotent. The page minted `capturedAt` inside its handler on
 *    every tap, so a second tap after a lost response produced a new key, a
 *    new identity, and a second moisture reading in insurance evidence.
 *    `idempotent-retry` is green against this defect because the seam test
 *    reuses one draft object: the fault is in WHO HOLDS the draft, which only
 *    a test of the holder can see.
 *
 * These drive the REAL `submitMetadataEvidence` with a REAL Ed25519 key
 * through a fake `fetch`, so the bytes asserted on are the bytes the server
 * would receive. A test that rebuilt the request itself could agree with a
 * page that was wrong, which is exactly how this shipped broken the first
 * time.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// RA-8388: the client error sink posts with the global `fetch`, not the
// form's injected one, so it is replaced here and asserted on directly.
const reportClientError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability", () => ({
  reportClientError,
  reportError: vi.fn(),
}));

import { MetadataCaptureForm } from "@/components/evidence/metadata-capture-form";
import {
  submitMetadataEvidence,
  type MetadataEvidenceDraft,
  type SignedRequestBytes,
} from "@/lib/evidence/submit-metadata-evidence";
import type { DeviceKeyRecord } from "@/lib/evidence/device-signing";

const USER_ID = "user_dani";
const INSPECTION_ID = "ins_nir_2026_11_b3f306";
const STEP_ID = "step_moisture_survey";

/** One real Ed25519 key, generated once - signing is not mocked. */
async function makeKey(): Promise<DeviceKeyRecord> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const b64 = Buffer.from(spki).toString("base64");
  return {
    keyId: "abcdef0123456789",
    privateKey: pair.privateKey,
    publicKeyPem: `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`,
    createdAt: new Date("2026-11-16T00:00:00.000Z").toISOString(),
    registered: true,
  };
}

interface Capture {
  idempotencyKey: string;
  body: string;
}

/**
 * A fake fetch that records every request and answers from a queue.
 *
 * A queued entry is either a Response spec or the string "throw", which
 * models the case the whole duplicate fault turns on: the request left the
 * device and the answer never came back.
 */
function makeFetch(
  queue: Array<
    | { status: number; body?: unknown; headers?: Record<string, string> }
    | "throw"
  >,
) {
  const captures: Capture[] = [];
  const impl = vi.fn(async (_url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    captures.push({
      idempotencyKey: headers["Idempotency-Key"],
      body: String(init.body),
    });
    const next = queue.shift() ?? { status: 201, body: { evidenceItem: { id: "ev_1" } } };
    if (next === "throw") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status,
      headers: { "content-type": "application/json", ...(next.headers ?? {}) },
    });
  });
  return { impl, captures };
}

function renderForm(opts: {
  evidenceClass?: string;
  fetchImpl: typeof fetch;
  key: DeviceKeyRecord;
  /** Replaces the key step, so a test can make signing fail on the device. */
  ensureKey?: () => Promise<DeviceKeyRecord>;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const submit = (
    draft: MetadataEvidenceDraft,
    signedCache: Map<string, SignedRequestBytes>,
  ) =>
    submitMetadataEvidence(draft, {
      userId: USER_ID,
      ensureKey: opts.ensureKey ?? (async () => opts.key),
      rotateKey: async () => {},
      signedCache,
      fetchImpl: opts.fetchImpl,
    });

  return render(
    <MetadataCaptureForm
      open
      evidenceClass={opts.evidenceClass ?? "MOISTURE_READING"}
      evidenceClassLabel="Moisture reading"
      inspectionId={INSPECTION_ID}
      workflowStepId={STEP_ID}
      deviceType="WEB_BROWSER"
      submit={submit}
      onSaved={opts.onSaved ?? (() => {})}
      onClose={opts.onClose ?? (() => {})}
    />,
  );
}

/** Fill a complete, valid moisture reading. */
function fillMoistureReading(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "metadata-location": "Living room south wall",
    "metadata-surfaceType": "Plasterboard",
    "metadata-moistureLevel": "18.4",
    "metadata-depth": "Surface",
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) {
    fireEvent.change(document.getElementById(id)!, { target: { value } });
  }
}

let key: DeviceKeyRecord;
beforeEach(async () => {
  key = await makeKey();
  reportClientError.mockReset();
});

describe("the entry is never discarded", () => {
  it("keeps every typed value when a required field is missing", async () => {
    const { impl } = makeFetch([]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    // Everything except the material, which is a required NOT NULL column.
    fillMoistureReading({ "metadata-surfaceType": "" });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await screen.findByText("Material is required");
    // The refusal names the field AND the entry survives. The prompt chain
    // did neither.
    expect(document.getElementById("metadata-location")).toHaveValue(
      "Living room south wall",
    );
    expect(document.getElementById("metadata-moistureLevel")).toHaveValue(18.4);
    expect(document.getElementById("metadata-depth")).toHaveValue("Surface");
    // Nothing was sent: an incomplete row is refused before it reaches the
    // server, not written with a guessed material.
    expect(impl).not.toHaveBeenCalled();
  });

  it("shows the message against the field it belongs to", async () => {
    const { impl } = makeFetch([]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading({ "metadata-moistureLevel": "250" });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    const message = await screen.findByText("Reading cannot be above 100%");
    expect(document.getElementById("metadata-moistureLevel")).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(message.id),
    );
  });

  it("offers a free-text note box for a technician note", async () => {
    const { impl } = makeFetch([]);
    renderForm({
      evidenceClass: "TECHNICIAN_NOTE",
      fetchImpl: impl as unknown as typeof fetch,
      key,
    });
    // The client reported there was nowhere to type triage or attendance
    // notes at all.
    const note = document.getElementById("metadata-note");
    expect(note).toBeInTheDocument();
    expect(note!.tagName).toBe("TEXTAREA");
  });
});

describe("one draft per entry", () => {
  it("replays the SAME key and the SAME bytes after a lost response", async () => {
    const { impl, captures } = makeFetch([
      "throw",
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    const onSaved = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onSaved });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    // The attempt was lost, so the form offers Retry and holds the entry.
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(document.getElementById("metadata-location")).toBeDisabled();
    // Closing drops the draft that makes a retry safe, and the lost attempt
    // may have been recorded. So the form never offers a bare "Discard": it
    // says to check the step's evidence before entering the reading again.
    expect(screen.queryByRole("button", { name: "Discard entry" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Close and check" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "check this step's evidence before entering it again",
    );

    fireEvent.click(retry);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(captures).toHaveLength(2);
    // THE ASSERTION. A new key here is a second reading in insurance
    // evidence; identical bytes under an identical key is one reading the
    // server can collapse.
    expect(captures[1].idempotencyKey).toBe(captures[0].idempotencyKey);
    expect(captures[1].body).toBe(captures[0].body);
    expect(captures[0].idempotencyKey).toBeTruthy();
  });

  it("offers NO retry when the server says the capture may already be saved", async () => {
    // The one failure a retry makes worse. The server answers 409 with
    // X-RestoreAssist-Idempotency-Uncertain when a transaction may have
    // committed before the connection dropped: the reading is probably in
    // the claim file already, so a Retry button here is how one measurement
    // becomes two signed readings an insurer can see disagree.
    const { impl, captures } = makeFetch([
      {
        status: 409,
        body: {
          error: {
            message: "This capture may already have been saved.",
          },
        },
        headers: { "X-RestoreAssist-Idempotency-Uncertain": "true" },
      },
    ]);
    const onSaved = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onSaved });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    // The technician is told to CHECK, and given exactly one way forward.
    const close = await screen.findByRole("button", {
      name: "Close and check",
    });
    expect(close).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save entry" })).toBeNull();
    expect(
      screen.getByText(/check the step's evidence before entering it again/i),
    ).toBeTruthy();

    // Nothing was reported as saved - the form does not know that it was.
    expect(onSaved).not.toHaveBeenCalled();
    // And exactly one request left the device.
    expect(captures).toHaveLength(1);
  });

  it("holds capturedAt from the confirm, so the key cannot drift with the clock", async () => {
    const { impl, captures } = makeFetch([
      { status: 503, body: { error: { message: "Service unavailable" } } },
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    await waitFor(() => expect(captures).toHaveLength(2));

    // The signed capture time is identical across attempts. That is the
    // invariant: `capturedAt` belongs to the draft, so however much real time
    // passes before the technician taps Retry, the key cannot drift. It also
    // means the row records when the reading was taken, not when the network
    // came back.
    const first = JSON.parse(JSON.parse(captures[0].body).signedManifest);
    const second = JSON.parse(JSON.parse(captures[1].body).signedManifest);
    expect(second.capturedAt).toBe(first.capturedAt);
    expect(captures[1].idempotencyKey).toBe(captures[0].idempotencyKey);
  });

  it("does not mint two drafts when the button is tapped twice in one tick", async () => {
    const { impl, captures } = makeFetch([
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
      { status: 201, body: { evidenceItem: { id: "ev_2" } } },
    ]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    const save = screen.getByRole("button", { name: "Save entry" });

    // Both clicks inside ONE act() batch, so React cannot re-render between
    // them. This matters: `fireEvent.click` twice in sequence flushes state
    // in between, the button's `disabled` attribute swallows the second tap,
    // and the test passes whatever the handler does - it would be a check
    // that cannot fail. Dispatching both in one batch is the only way to
    // reach the handler twice and actually exercise the guard.
    await act(async () => {
      save.click();
      save.click();
    });

    await waitFor(() => expect(captures.length).toBeGreaterThan(0));
    // Two drafts would mean two capturedAt values, two keys, and two
    // moisture readings in insurance evidence.
    expect(captures).toHaveLength(1);
  });

  it("unlocks the fields on a definite refusal so the entry can be corrected", async () => {
    const { impl, captures } = makeFetch([
      {
        status: 400,
        body: { error: { message: "Material is required and was not supplied." } },
      },
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await screen.findByText(/Material is required and was not supplied/);
    // Nothing was written, so this is editable again - not stuck on Retry.
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(document.getElementById("metadata-location")).not.toBeDisabled();
    expect(document.getElementById("metadata-location")).toHaveValue(
      "Living room south wall",
    );

    // Correcting the entry is a NEW submission and must mint a new key: it is
    // genuinely different content.
    fireEvent.change(document.getElementById("metadata-moistureLevel")!, {
      target: { value: "22.1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() => expect(captures).toHaveLength(2));
    expect(captures[1].idempotencyKey).not.toBe(captures[0].idempotencyKey);
  });

  it("clears the entry only after the server accepted it", async () => {
    const { impl } = makeFetch([
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderForm({
      fetchImpl: impl as unknown as typeof fetch,
      key,
      onSaved,
      onClose,
    });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0]).toMatchObject({ ok: true, status: 201 });
  });

  // RA-8388. Not every refusal from POST /evidence uses the
  // `{ error: { message } }` envelope. The tenancy check and the idempotency
  // wrapper answer `{ error: "..." }`, a plain string. The form read only the
  // envelope, so those refusals were shown as "This entry was not saved."
  // with the server's reason thrown away.
  it("shows a refusal the server sent as a plain string", async () => {
    // Twice: a 403 is also how the server rejects a device key, so the
    // writer rotates the key and tries once more before giving up.
    const refusal = {
      status: 403,
      body: { error: "You do not have access to record evidence on this job." },
    };
    const { impl } = makeFetch([refusal, { ...refusal }]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await screen.findByText(
      /You do not have access to record evidence on this job\./,
    );
    expect(screen.queryByText(/This entry was not saved/)).not.toBeInTheDocument();
  });

  it("shows the idempotency wrapper's plain-string 409 and keeps the entry for Retry", async () => {
    const { impl } = makeFetch([
      {
        status: 409,
        body: {
          error:
            "A request with this Idempotency-Key is already in progress. Retry shortly.",
        },
      },
    ]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await screen.findByText(/already in progress\. Retry shortly\./);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("still says the entry was not saved when the refusal carries no words at all", async () => {
    const { impl } = makeFetch([{ status: 400, body: {} }]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await screen.findByText(/This entry was not saved\./);
  });

  // RA-8388. The duplicate answer: the server already holds this exact
  // signed capture and returns it with 200. This PINS behaviour the form
  // already had (any 2xx is saved); it was not watched failing here. What
  // was wrong was the capture page's use of the answer, which is tested in
  // app/dashboard/inspections/[id]/capture/__tests__/page.refusals.ra8388.test.tsx.
  it("treats the duplicate answer as saved: no error, no retry, and the answer is handed on whole", async () => {
    const { impl, captures } = makeFetch([
      {
        status: 200,
        body: { evidenceItem: { id: "ev_1" }, alreadyRecorded: true },
      },
    ]);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderForm({
      fetchImpl: impl as unknown as typeof fetch,
      key,
      onSaved,
      onClose,
    });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(captures).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    // The page decides the wording from this flag, so it must arrive.
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      ok: true,
      status: 200,
      data: { evidenceItem: { id: "ev_1" }, alreadyRecorded: true },
    });
  });
});

describe("the request carries the signed metadata contract", () => {
  it("sends a signed manifest and the normalised field values", async () => {
    const { impl, captures } = makeFetch([
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() => expect(captures).toHaveLength(1));

    const body = JSON.parse(captures[0].body);
    // This is the fault the whole change exists to close: text evidence is
    // signed now, exactly like a photo.
    expect(typeof body.signedManifest).toBe("string");
    expect(typeof body.manifestSignature).toBe("string");
    expect(body.evidenceClass).toBe("MOISTURE_READING");
    expect(body.workflowStepId).toBe(STEP_ID);
    // Numbers travel as numbers, so the authoritative row and the evidence
    // record cannot disagree about whether 18.40 and 18.4 are one reading.
    expect(body.structuredData.moistureLevel).toBe(18.4);
    expect(body.structuredData.surfaceType).toBe("Plasterboard");
    expect(body.structuredData.depth).toBe("Surface");

    const manifest = JSON.parse(body.signedManifest);
    expect(manifest.digestKind).toBe("metadata");
    expect(manifest.inspectionId).toBe(INSPECTION_ID);
  });

  it("collects both ambient fields, not one number labelled RH", async () => {
    const { impl, captures } = makeFetch([
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    renderForm({
      evidenceClass: "AMBIENT_ENVIRONMENTAL",
      fetchImpl: impl as unknown as typeof fetch,
      key,
    });

    fireEvent.change(document.getElementById("metadata-location")!, {
      target: { value: "Hallway" },
    });
    fireEvent.change(document.getElementById("metadata-ambientTemperature")!, {
      target: { value: "21.5" },
    });
    fireEvent.change(document.getElementById("metadata-humidityLevel")!, {
      target: { value: "68" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() => expect(captures).toHaveLength(1));
    const body = JSON.parse(captures[0].body);
    // EnvironmentalData requires BOTH; the old screen asked for one.
    expect(body.structuredData.ambientTemperature).toBe(21.5);
    expect(body.structuredData.humidityLevel).toBe(68);
  });
});

/**
 * RA-8388 review finding "a device that cannot sign is invisible".
 *
 * Signing and key set-up run BEFORE any request leaves the device. The form
 * caught every throw alike, said "That did not reach the server ... tap
 * Retry", and threw the error away - so a device that cannot sign at all
 * (no Ed25519 in the WebView, IndexedDB refused) looked like a bad
 * connection to the technician and like nothing at all to us.
 */
describe("a device that cannot sign", () => {
  const cannotSign = () =>
    Promise.reject(
      new DOMException("Ed25519 is not supported", "NotSupportedError"),
    );

  it("says the device could not sign, and does not blame the connection", async () => {
    const { impl } = makeFetch([]);
    renderForm({
      fetchImpl: impl as unknown as typeof fetch,
      key,
      ensureKey: cannotSign,
    });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await screen.findByRole("button", { name: "Retry" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/could not sign/i);
    // Nothing left the device, so the form must not say a request was lost
    // on its way to the server.
    expect(alert).not.toHaveTextContent(/did not reach the server/i);
    expect(impl).not.toHaveBeenCalled();
    // Retry is offered, but not as a promise that it will work.
    expect(alert).toHaveTextContent(/if it fails again/i);
    // The entry is kept and locked, exactly as for any other unknown outcome.
    expect(document.getElementById("metadata-location")).toBeDisabled();
    expect(document.getElementById("metadata-location")).toHaveValue(
      "Living room south wall",
    );
    expect(alert).toHaveTextContent(
      "check this step's evidence before entering it again",
    );
  });

  it("reports the failure once, however many times Retry is tapped", async () => {
    const { impl } = makeFetch([]);
    const ensureKey = vi.fn(cannotSign);
    renderForm({
      fetchImpl: impl as unknown as typeof fetch,
      key,
      ensureKey,
    });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(ensureKey).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Retry" });

    expect(reportClientError).toHaveBeenCalledTimes(1);
    const [reported] = reportClientError.mock.calls[0] as [Error];
    // The name is what reaches the server log, so it is what is pinned.
    expect(reported.name).toBe("DeviceSigningError");
    // Built from the stage and the cause's name only: never the reading.
    expect(reported.message).toContain("NotSupportedError");
    expect(reported.message).not.toContain("Living room");
    expect(reported.message).not.toContain("18.4");
    expect(reported.message).not.toContain(USER_ID);
  });

  it("keeps the same draft, so a Retry that can sign saves it once", async () => {
    const { impl, captures } = makeFetch([
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    const ensureKey = vi
      .fn<() => Promise<DeviceKeyRecord>>()
      .mockRejectedValueOnce(new Error("IndexedDB open failed"))
      .mockResolvedValue(key);
    const onSaved = vi.fn();
    renderForm({
      fetchImpl: impl as unknown as typeof fetch,
      key,
      ensureKey,
      onSaved,
    });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    const retry = await screen.findByRole("button", { name: "Retry" });
    const failedAt = Date.now();
    fireEvent.click(retry);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(captures).toHaveLength(1);
    // Always signed: there is no unsigned fallback for a device in trouble.
    const body = JSON.parse(captures[0].body);
    expect(typeof body.signedManifest).toBe("string");
    expect(typeof body.manifestSignature).toBe("string");
    // The capture time is the confirm, not the retry.
    const capturedAt = Date.parse(JSON.parse(body.signedManifest).capturedAt);
    expect(capturedAt).toBeLessThanOrEqual(failedAt);
  });

  it("does not report a lost connection as a signing failure", async () => {
    // Control for the tests above: a thrown fetch keeps its own wording and
    // is not sent to the error sink as a device fault.
    const { impl } = makeFetch(["throw"]);
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /did not reach the server/i,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/could not sign/i);
    expect(reportClientError).not.toHaveBeenCalled();
  });
});

/**
 * RA-8388 review finding "no time limit on the evidence POST".
 *
 * While a save is outstanding Cancel and Save are disabled and the dialog
 * refuses to close. A request that never answers therefore left the
 * technician with no exit but killing the app, which drops the draft that
 * makes a retry safe.
 */
describe("a save that never answers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up after 30 seconds and offers Retry with the same key and bytes", async () => {
    const captures: Capture[] = [];
    let markSent: () => void = () => {};
    const sent = new Promise<void>((resolve) => {
      markSent = resolve;
    });
    const impl = vi.fn((_url: string, init: RequestInit) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      captures.push({
        idempotencyKey: headers["Idempotency-Key"],
        body: String(init.body),
      });
      if (captures.length === 1) {
        markSent();
        // The request left the device and nothing ever came back.
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(
        new Response(JSON.stringify({ evidenceItem: { id: "ev_1" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    const ensureKey = vi.fn(async () => key);
    const onSaved = vi.fn();
    renderForm({
      fetchImpl: impl as unknown as typeof fetch,
      key,
      ensureKey,
      onSaved,
    });

    fillMoistureReading();
    // Only the two timer functions the time limit uses; signing is real
    // WebCrypto. While they are faked this test uses `act` and synchronous
    // queries only: Testing Library's `findBy` and `waitFor` wait on a
    // `setTimeout` of their own and would never return.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await sent;

    // One millisecond short of the limit: still saving, still no exit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    vi.useRealTimers();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(screen.getByRole("button", { name: "Close and check" })).toBeEnabled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/did not answer in time/i);
    expect(alert).toHaveTextContent(/Your entry is kept/);
    expect(alert).toHaveTextContent(
      "check this step's evidence before entering it again",
    );
    // It is unknown whether the row was written, so the entry stays locked.
    expect(document.getElementById("metadata-location")).toBeDisabled();
    // A slow network is not a device fault.
    expect(reportClientError).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(captures).toHaveLength(2);
    expect(captures[0].idempotencyKey).toBeTruthy();
    expect(captures[1].idempotencyKey).toBe(captures[0].idempotencyKey);
    expect(captures[1].body).toBe(captures[0].body);
    // The retry replayed the cached signed bytes; it did not sign again.
    expect(ensureKey).toHaveBeenCalledTimes(1);
  });
});

/**
 * RA-8388. The page reloads the step's evidence when the form closes after a
 * send whose outcome it cannot vouch for. It could not tell that close from
 * a plain Cancel, so a Cancel with no connection showed "Could not refresh
 * this step's evidence" for an entry that was never sent. The form knows
 * which close it is, so it says.
 */
describe("the form says why it closed", () => {
  it("says nothing was sent when the technician cancels before saving", async () => {
    const { impl } = makeFetch([]);
    const onClose = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onClose });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("no-attempt");
    expect(impl).not.toHaveBeenCalled();
  });

  it("says nothing was sent when the entry was refused on the device and then cancelled", async () => {
    const { impl } = makeFetch([]);
    const onClose = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onClose });

    fillMoistureReading({ "metadata-surfaceType": "" });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await screen.findByText("Material is required");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledWith("no-attempt");
    expect(impl).not.toHaveBeenCalled();
  });

  it("says saved when the server accepted the entry", async () => {
    const { impl } = makeFetch([
      { status: 201, body: { evidenceItem: { id: "ev_1" } } },
    ]);
    const onClose = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onClose });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledWith("saved");
  });

  it("says sent but not confirmed when the answer was lost and the technician closes to check", async () => {
    const { impl } = makeFetch(["throw"]);
    const onClose = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onClose });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(screen.getByRole("button", { name: "Close and check" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("attempt-not-confirmed-saved");
  });

  it("says sent but not confirmed when the server says the entry may already be saved", async () => {
    const { impl } = makeFetch([
      {
        status: 409,
        body: { error: { message: "This capture may already have been saved." } },
        headers: { "X-RestoreAssist-Idempotency-Uncertain": "true" },
      },
    ]);
    const onClose = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onClose });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Close and check" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    // The reason and nothing else: this button used to hand the page its
    // click event.
    expect(onClose.mock.calls[0]).toEqual(["attempt-not-confirmed-saved"]);
  });

  it("still says sent but not confirmed when a send was refused outright and the technician then cancels", async () => {
    // A definite refusal writes nothing, but an earlier send in the same
    // opening may have: the form does not try to prove a negative.
    const { impl } = makeFetch([
      { status: 400, body: { error: { message: "Reading is not valid." } } },
    ]);
    const onClose = vi.fn();
    renderForm({ fetchImpl: impl as unknown as typeof fetch, key, onClose });

    fillMoistureReading();
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await screen.findByText("Reading is not valid.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledWith("attempt-not-confirmed-saved");
  });
});
