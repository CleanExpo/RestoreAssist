"use client";

/**
 * RA-8388 AMENDMENT 03 §M: the capture form for metadata-only evidence.
 *
 * What this replaces, and why it is a component.
 *
 * `capture/page.tsx` drove a technician note, a moisture reading, an ambient
 * reading and an equipment log through a chain of `window.prompt` calls. A
 * blank or cancelled prompt ran `setSelectedEvidenceClass(null); return;` -
 * the chain had nowhere to keep what had been typed, so it threw it away.
 * That is the client's "nothing happens after I click OK" and her lost
 * entries. The chain also cannot collect `surfaceType` or `depth`, so a
 * moisture reading could not produce a complete `MoistureReading` row at all.
 *
 * Two things live here that cannot live in the page:
 *
 * 1. **The field contract is rendered, not retyped.** Every field comes from
 *    `lib/evidence/metadata-fields.ts`, which is also what builds the signed
 *    payload and the authoritative row. A form that held its own idea of what
 *    a reading contains is the fault this module exists to prevent.
 *
 * 2. **The draft is created once and reused.** `submit-metadata-evidence.ts`
 *    derives its idempotency key from draft content plus `capturedAt`, so
 *    replaying one draft is genuinely idempotent - but the page called
 *    `newDraftCapturedAt()` inside its handler on every tap. A second tap
 *    after a lost response therefore minted a NEW key, the server saw a brand
 *    new submission, and one measurement was written into insurance evidence
 *    twice with nothing to mark the duplicate. The draft is state here, and
 *    the same object is reused for every retry until a 2xx.
 *
 * An edit after a lost response is that same fault wearing different clothes:
 * changed content mints a new key. So a retryable failure LOCKS the fields and
 * offers Retry only. A definite refusal - the server naming a field - unlocks
 * them, because that submission was never written and the technician has to
 * correct it.
 *
 * Values and draft are held above the dialog content: Radix unmounts its
 * children on close, and state held inside them would restore the exact
 * data-loss bug this component removes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  METADATA_FIELDS,
  buildMetadataNotes,
  buildMetadataStructuredData,
  buildMetadataTitle,
  validateMetadataValues,
  type MetadataField,
  type MetadataValues,
} from "@/lib/evidence/metadata-fields";
import type {
  MetadataEvidenceDraft,
  MetadataSubmitResult,
  SignedRequestBytes,
} from "@/lib/evidence/submit-metadata-evidence";
import { newDraftCapturedAt } from "@/lib/evidence/submit-metadata-evidence";

/**
 * Whether a failed attempt may be retried with the SAME bytes.
 *
 * A 4xx the server chose deliberately (it named a missing field, refused the
 * key, rejected the binding) will refuse the identical bytes identically, so
 * retrying is pointless and the technician must change something. Everything
 * else - a thrown fetch, a 5xx, a timeout, a conflict, a rate limit - leaves
 * it genuinely unknown whether the row was written, which is exactly when the
 * draft must be replayed rather than rebuilt.
 */
export function isRetryableFailure(status: number): boolean {
  if (status === 0) return true; // the request never produced a response
  if (status === 408 || status === 409 || status === 429) return true;
  return status < 400 || status >= 500;
}

/**
 * `may-have-saved` is deliberately NOT a kind of `retryable`.
 *
 * The server returns it when a capture may have committed before the
 * connection dropped. Offering Retry there is how one measurement becomes
 * two signed readings in a claim file, so this state offers no Retry at all:
 * the only safe next action is to close and look at what the step already
 * holds.
 */
/**
 * Shown whenever an attempt's outcome is unknown and the technician can still
 * close the form. Retry replays the same draft and cannot duplicate. Closing
 * drops that draft, so entering the reading again is a NEW capture - and if
 * the first one did reach the server, the job would then hold it twice.
 */
const CLOSE_INSTEAD_WARNING =
  "If you close instead, check this step's evidence before entering it again.";

type FormStatus = "editing" | "sending" | "retryable" | "may-have-saved";

export interface MetadataCaptureFormProps {
  open: boolean;
  evidenceClass: string;
  /** Shown in the dialog heading, e.g. "Moisture reading". */
  evidenceClassLabel: string;
  inspectionId: string;
  workflowStepId: string | null;
  deviceType: string;
  /**
   * Injected so this component never holds a second opinion about how a
   * submission is built. The page passes `submitMetadataEvidence` with its
   * device-key dependencies; the test passes a fake fetch through the same
   * real function.
   */
  submit: (
    draft: MetadataEvidenceDraft,
    signedCache: Map<string, SignedRequestBytes>,
  ) => Promise<MetadataSubmitResult>;
  onSaved: (result: MetadataSubmitResult) => void;
  onClose: () => void;
}

export function MetadataCaptureForm({
  open,
  evidenceClass,
  evidenceClassLabel,
  inspectionId,
  workflowStepId,
  deviceType,
  submit,
  onSaved,
  onClose,
}: MetadataCaptureFormProps) {
  const fields = useMemo<MetadataField[]>(
    () => METADATA_FIELDS[evidenceClass] ?? [],
    [evidenceClass],
  );

  const [values, setValues] = useState<MetadataValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<FormStatus>("editing");
  const [formMessage, setFormMessage] = useState<string | null>(null);

  /**
   * The draft in flight. Non-null from the moment the entry is confirmed
   * until a 2xx or a definite refusal. Every retry reuses THIS object, which
   * is what makes the retry idempotent.
   */
  const draftRef = useRef<MetadataEvidenceDraft | null>(null);

  /**
   * Set synchronously at the top of a confirm or retry, so two taps landing
   * in the same tick cannot both mint a draft.
   *
   * `status` cannot do this job: it is React state, so a second tap arriving
   * before the re-render still reads "editing" and proceeds. Two drafts means
   * two `capturedAt` values, two keys and two readings - the exact duplicate
   * this component exists to prevent, reached by the fastest possible route.
   */
  const inFlightRef = useRef(false);

  /**
   * This form's own signed-bytes cache, keyed by idempotency key.
   *
   * Deliberately not the page's: the page clears its cache on other events,
   * which would force a re-sign between an attempt and its retry and turn a
   * legitimate replay into a second submission.
   */
  const signedCacheRef = useRef(new Map<string, SignedRequestBytes>());

  const reset = useCallback(() => {
    setValues({});
    setErrors({});
    setFormMessage(null);
    setStatus("editing");
    draftRef.current = null;
    inFlightRef.current = false;
    signedCacheRef.current = new Map();
  }, []);

  /**
   * Values belong to ONE evidence class.
   *
   * `location` appears in the contract for a moisture reading, an ambient
   * reading and an equipment log. Without this, a location typed for a
   * moisture reading is still sitting in state when the technician opens the
   * ambient form, so a reading is pre-filled with a place it was not taken -
   * invented data inside an insurance record, which AMENDMENT 02 §F forbids
   * however convenient the carry-over looks.
   */
  useEffect(() => {
    reset();
  }, [evidenceClass, reset]);

  const setField = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear only this field's message. Wiping every message on each keystroke
    // hides the other problems the technician still has to fix.
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const send = useCallback(
    async (draft: MetadataEvidenceDraft) => {
      setStatus("sending");
      setFormMessage(null);
      let result: MetadataSubmitResult;
      try {
        result = await submit(draft, signedCacheRef.current);
      } catch {
        // A thrown fetch leaves it unknown whether the row was written. Keep
        // the draft so the retry replays the same bytes under the same key.
        draftRef.current = draft;
        inFlightRef.current = false;
        setStatus("retryable");
        setFormMessage(
          "That did not reach the server. Your entry is kept - tap Retry. " +
            "It cannot be saved twice. " +
            CLOSE_INSTEAD_WARNING,
        );
        return;
      }

      if (result.ok) {
        const saved = result;
        reset();
        onSaved(saved);
        onClose();
        return;
      }

      const body = result.data as
        | { error?: { message?: string }; message?: string }
        | null;
      const serverMessage =
        body?.error?.message ?? body?.message ?? "This entry was not saved.";

      // Checked BEFORE the retryable test, because a 409 is otherwise
      // retryable and this is the one 409 that must not be retried.
      if (result.mayHaveSaved) {
        // The draft is dropped on purpose: there is nothing to replay, and
        // keeping it would put a Retry button in reach of a reading that is
        // very likely already recorded.
        draftRef.current = null;
        inFlightRef.current = false;
        setStatus("may-have-saved");
        setFormMessage(
          `${serverMessage} Close this and check the step's evidence before entering it again.`,
        );
        return;
      }

      if (isRetryableFailure(result.status)) {
        draftRef.current = draft;
        inFlightRef.current = false;
        setStatus("retryable");
        setFormMessage(
          `${serverMessage} Your entry is kept - tap Retry. It cannot be saved twice. ${CLOSE_INSTEAD_WARNING}`,
        );
        return;
      }

      // A definite refusal: nothing was written, so the technician edits and
      // confirms again, and the next confirm mints a new draft.
      draftRef.current = null;
      inFlightRef.current = false;
      setStatus("editing");
      setFormMessage(serverMessage);
    },
    [submit, reset, onSaved, onClose],
  );

  const handleConfirm = useCallback(async () => {
    // Synchronous, before any await and before any state read, so a double
    // tap cannot mint two drafts.
    if (inFlightRef.current) return;

    const validation = validateMetadataValues(evidenceClass, values);
    if (!validation.ok) {
      // Everything typed stays on screen. The whole reason this component
      // exists is that the prompt chain discarded it.
      setErrors(validation.errors);
      setFormMessage(null);
      return;
    }
    setErrors({});
    inFlightRef.current = true;

    const draft: MetadataEvidenceDraft = {
      inspectionId,
      workflowStepId,
      evidenceClass,
      title: buildMetadataTitle(evidenceClass, values),
      notes: buildMetadataNotes(evidenceClass, values),
      structuredData: buildMetadataStructuredData(evidenceClass, values),
      // Minted ONCE, here, when the entry is confirmed - never at send time.
      capturedAt: newDraftCapturedAt(),
      deviceType,
    };
    draftRef.current = draft;
    await send(draft);
  }, [evidenceClass, values, inspectionId, workflowStepId, deviceType, send]);

  const handleRetry = useCallback(async () => {
    if (inFlightRef.current) return;
    const draft = draftRef.current;
    if (!draft) return;
    inFlightRef.current = true;
    // The SAME draft object: same capturedAt, same content, same key, and the
    // same cached signed bytes.
    await send(draft);
  }, [send]);

  const handleDiscard = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const locked =
    status === "sending" ||
    status === "retryable" ||
    status === "may-have-saved";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        // Typed evidence is never discarded by a stray tap. A gloved hand on
        // a phone hits the overlay constantly, and the fault this component
        // exists to remove is precisely "my entry disappeared". An empty form
        // has nothing to lose, so that one closes; anything with text in it,
        // or an attempt in flight, closes only via the explicit button.
        if (locked) return;
        if (Object.values(values).some((v) => v.trim() !== "")) return;
        handleDiscard();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{evidenceClassLabel}</DialogTitle>
          <DialogDescription>
            Recorded against this job and signed by this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {fields.map((field) => {
            const id = `metadata-${field.key}`;
            const error = errors[field.key];
            const describedBy = [
              field.help ? `${id}-help` : null,
              error ? `${id}-error` : null,
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={id}>
                  {field.label}
                  {field.unit ? (
                    <span className="ml-1 text-slate-500">({field.unit})</span>
                  ) : null}
                  {field.required ? null : (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      optional
                    </span>
                  )}
                </Label>

                {field.kind === "textarea" ? (
                  <Textarea
                    id={id}
                    value={values[field.key] ?? ""}
                    placeholder={field.placeholder}
                    disabled={locked}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(e) => setField(field.key, e.target.value)}
                    rows={3}
                  />
                ) : field.kind === "select" ? (
                  // A native select: it opens the platform picker on a phone,
                  // which is what a technician uses this on, and it is the
                  // repository's prevailing convention for data-entry forms.
                  <select
                    id={id}
                    value={values[field.key] ?? ""}
                    disabled={locked}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className={cn(
                      "flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      "dark:border-slate-800 dark:focus-visible:ring-slate-300",
                      error && "border-destructive",
                    )}
                  >
                    <option value="">Select</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={id}
                    type={field.kind === "number" ? "number" : "text"}
                    inputMode={field.kind === "number" ? "decimal" : undefined}
                    value={values[field.key] ?? ""}
                    placeholder={field.placeholder}
                    disabled={locked}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                )}

                {field.help ? (
                  <p id={`${id}-help`} className="text-xs text-slate-500">
                    {field.help}
                  </p>
                ) : null}
                {error ? (
                  <p
                    id={`${id}-error`}
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {formMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {formMessage}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          {status === "may-have-saved" ? (
            // One action only. No Discard (there is nothing in flight to
            // discard) and no Retry (retrying is the hazard).
            <Button type="button" onClick={onClose}>
              Close and check
            </Button>
          ) : (
            <>
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscard}
            disabled={status === "sending"}
          >
            {/* Not "Discard": after a lost response the reading may
                already be recorded, and closing drops the draft that makes a
                retry safe. The label says what to do next. */}
            {status === "retryable" ? "Close and check" : "Cancel"}
          </Button>
          {status === "retryable" ? (
            <Button type="button" onClick={handleRetry}>
              Retry
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={status === "sending"}
            >
              {status === "sending" ? "Saving" : "Save entry"}
            </Button>
          )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
