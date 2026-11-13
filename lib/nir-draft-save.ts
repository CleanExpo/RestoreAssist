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

/** A sidecar panel. isReady is false until its saved data has loaded; until
 *  then it holds defaults, and saving through it would overwrite real data. */
export interface SidecarPanel {
  persist: () => Promise<void>;
  isReady: () => boolean;
}

export interface SidecarSource {
  /** The on-screen panel, read when the part runs (it may mount mid-save). */
  panel: () => SidecarPanel | null | undefined;
  /** True when the form holds data for this part (for example a Quick Fill seed). */
  hasPendingData: () => boolean;
  /** Whether the panel was on screen when Save Draft was pressed. A panel the
   *  technician could see may hold edits nobody can confirm until it loads. */
  wasOnScreen: boolean;
}

/**
 * One rule for every sidecar (RA-8330 review): a part with data to save is
 * never counted as saved unless something actually wrote it. Only a part with
 * no loaded panel and no data is skipped, because there is nothing to save.
 */
export function sidecarPart(label: string, source: SidecarSource): DraftSavePart {
  return {
    label,
    run: async () => {
      const panel = source.panel();
      if (panel && panel.isReady()) return panel.persist();
      // Skip only what the technician could not have touched: no panel on
      // screen at the press and no pending data (review round 5).
      if (!source.wasOnScreen && !source.hasPendingData()) return;
      // Never write data the panel has not confirmed against the saved
      // record (RA-8330 review round 4): name the part instead.
      throw new Error(`${label} is not ready yet; press Save Draft again`);
    },
  };
}

export function draftSaveFailureMessage(failures: readonly DraftSaveFailure[]): string {
  const names = failures.map((f) => f.label).join(", ");
  return `Draft not fully saved. These parts did not save: ${names}. Try Save Draft again.`;
}

export interface CurrentRead {
  ok: boolean;
  status: number;
  /** The parsed body of a 2xx reply; null for any other status. */
  record: unknown;
}

/**
 * RA-8330 (PR review round 7): the one way a side panel reads its saved record.
 * Returns null when a newer request started while this one waited, either on
 * the network or on the body, so a stale reply is never applied and never
 * marks a panel ready. Callers must not read the raw Response themselves.
 */
export async function readIfCurrent(
  load: () => Promise<Response>,
  isCurrent: () => boolean,
): Promise<CurrentRead | null> {
  const res = await load();
  if (!isCurrent()) return null;
  const record: unknown = res.ok ? await res.json() : null;
  if (!isCurrent()) return null;
  return { ok: res.ok, status: res.status, record };
}
