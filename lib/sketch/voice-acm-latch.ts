/**
 * Raise-only asbestos latch for a voice-accepted material.
 *
 * Undo and redo reload an earlier canvas snapshot. Once a room has had
 * voiceRaisedAcm set, those snapshots must not clear it. The set only grows.
 */

export interface LatchObject {
  data?: {
    id?: string;
    voiceRaisedAcm?: boolean;
  };
}

/** Mark one room raised and remember it. Never writes the flag false. */
export function raiseVoiceAcmLatch(
  objects: LatchObject[],
  roomId: string,
  raised: ReadonlySet<string>,
): Set<string> {
  const next = new Set(raised);
  for (const obj of objects) {
    if (obj.data?.id !== roomId) continue;
    obj.data.voiceRaisedAcm = true;
    next.add(roomId);
  }
  return next;
}

/** Add every object that already carries the latch. Does not drop ids. */
export function rememberVoiceAcmLatch(
  objects: LatchObject[],
  raised: ReadonlySet<string>,
): Set<string> {
  const next = new Set(raised);
  for (const obj of objects) {
    const id = obj.data?.id;
    if (typeof id === "string" && obj.data?.voiceRaisedAcm === true) {
      next.add(id);
    }
  }
  return next;
}

/** Put the latch back on any remembered room after a history reload. */
export function reapplyVoiceAcmLatch(
  objects: LatchObject[],
  raised: ReadonlySet<string>,
): void {
  if (raised.size === 0) return;
  for (const obj of objects) {
    const id = obj.data?.id;
    if (typeof id === "string" && raised.has(id) && obj.data) {
      obj.data.voiceRaisedAcm = true;
    }
  }
}
