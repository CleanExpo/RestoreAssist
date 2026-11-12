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

export interface SidecarSource {
  /** The on-screen panel, read when the part runs (it may mount mid-save). */
  panel: () => { persist: () => Promise<void> } | null | undefined;
  /** True when the form holds data for this part (for example a Quick Fill seed). */
  hasPendingData: () => boolean;
  /** Saves the pending data without the panel, when a direct route exists. */
  saveDirect?: () => Promise<void>;
}

/**
 * One rule for every sidecar (RA-8330 review): a part with data to save is
 * never counted as saved unless something actually wrote it. Only a part with
 * no panel and no data is skipped, because there is nothing to save.
 */
export function sidecarPart(label: string, source: SidecarSource): DraftSavePart {
  return {
    label,
    run: async () => {
      const panel = source.panel();
      if (panel) return panel.persist();
      if (!source.hasPendingData()) return;
      if (source.saveDirect) return source.saveDirect();
      throw new Error(`${label} is not on screen yet; press Save Draft again`);
    },
  };
}

export function draftSaveFailureMessage(failures: readonly DraftSaveFailure[]): string {
  const names = failures.map((f) => f.label).join(", ");
  return `Draft not fully saved. These parts did not save: ${names}. Try Save Draft again.`;
}
