/**
 * RA-8434 — the offline queues the public Features page (app/features/page.tsx)
 * is allowed to advertise. The page builds its "N separate offline queues"
 * claim from this list, and lib/__tests__/features-offline-queues.test.ts
 * proves every entry has a real caller: a non-test file under app/ or
 * components/ that imports `writer` from `file`. A queue that exists on disk
 * but that no screen writes to cannot stay on this list.
 *
 * Plain data, no imports, so the page and the test read the same values.
 */
export type OfflineQueueClaim = {
  /** How the Features page names the queue. */
  label: string;
  /** Repository path of the queue module. */
  file: string;
  /** The exported function that puts an entry on the queue. */
  writer: string;
};

export const OFFLINE_QUEUES: readonly OfflineQueueClaim[] = [
  {
    label: "evidence uploads",
    file: "lib/evidence-upload-queue.ts",
    writer: "queueEvidenceUpload",
  },
  {
    label: "inspection writes",
    file: "lib/nir-sync-queue.ts",
    writer: "queueWrite",
  },
  {
    label: "voice notes",
    file: "lib/voice-note-queue.ts",
    writer: "queueVoiceNote",
  },
  {
    label: "room-scan custody records",
    file: "lib/sketch/roomplan-custody-queue.ts",
    writer: "enqueueRoomPlanCapture",
  },
];

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** "Four separate offline queues", counted from OFFLINE_QUEUES. */
export function offlineQueuesHeadline(
  queues: readonly OfflineQueueClaim[] = OFFLINE_QUEUES,
): string {
  const word = NUMBER_WORDS[queues.length] ?? String(queues.length);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} separate offline queues`;
}

/** "Evidence uploads, inspection writes, voice notes and room-scan custody records." */
export function offlineQueuesList(
  queues: readonly OfflineQueueClaim[] = OFFLINE_QUEUES,
): string {
  const labels = queues.map((q) => q.label);
  const joined =
    labels.length <= 1
      ? (labels[0] ?? "")
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}
