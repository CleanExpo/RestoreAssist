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
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const submit = (
    draft: MetadataEvidenceDraft,
    signedCache: Map<string, SignedRequestBytes>,
  ) =>
    submitMetadataEvidence(draft, {
      userId: USER_ID,
      ensureKey: async () => opts.key,
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
