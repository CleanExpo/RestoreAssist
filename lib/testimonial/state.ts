/**
 * Testimonial Engine — pure state machine + two-key publish gate.
 *
 * Status flow: invited → recorded → consented → processing → ready → approved
 * → published, with `discarded` reachable from any pre-publish state. Publishing
 * additionally requires BOTH homeowner consent AND contractor approval
 * (the two-key rule) — enforced by `canPublish`.
 */

export const STATUSES = [
  "invited",
  "recorded",
  "consented",
  "processing",
  "ready",
  "approved",
  "published",
  "discarded",
] as const;
export type Status = (typeof STATUSES)[number];

const NEXT: Record<string, string[]> = {
  invited: ["recorded", "discarded"],
  recorded: ["consented", "discarded"],
  consented: ["processing", "discarded"],
  processing: ["ready", "discarded"],
  ready: ["approved", "discarded"],
  approved: ["published", "discarded"],
  published: [],
  discarded: [],
};

export function canTransition(from: string, to: string): boolean {
  return (NEXT[from] ?? []).includes(to);
}

export function canPublish(x: {
  status: string;
  hasConsent: boolean;
  hasApproval: boolean;
}): boolean {
  return x.status === "approved" && x.hasConsent && x.hasApproval;
}
