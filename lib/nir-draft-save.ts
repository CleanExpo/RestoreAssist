/**
 * Draft save for the NIR technician form.
 *
 * A draft is a work in progress, so it must never be refused by the
 * "ready to submit" checks (make-safe readiness and the like). Each part is
 * saved on its own; one failing part does not stop the others, and the
 * caller is told exactly which parts did not save.
 */

export interface DraftSavePart {
  /** Plain-English name shown to the technician, e.g. "make-safe checklist". */
  label: string;
  run: () => Promise<void>;
}

export interface DraftSaveFailure {
  label: string;
  message: string;
}

export interface DraftSaveResult {
  ok: boolean;
  failures: DraftSaveFailure[];
}

export async function saveDraftParts(
  parts: readonly DraftSavePart[],
): Promise<DraftSaveResult> {
  const failures: DraftSaveFailure[] = [];
  for (const part of parts) {
    try {
      await part.run();
    } catch (error: unknown) {
      failures.push({
        label: part.label,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { ok: failures.length === 0, failures };
}

export function draftSaveFailureMessage(failures: readonly DraftSaveFailure[]): string {
  const names = failures.map((f) => f.label).join(", ");
  return `Draft not fully saved. These parts did not save: ${names}. Try Save Draft again.`;
}
