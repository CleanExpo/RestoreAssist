/**
 * RA-8220: one client's history across every job, newest first: jobs opened
 * and completed, and the update emails the client was sent.
 */

export type TimelineEventKind = "job_opened" | "job_completed" | "email_sent";

export interface TimelineEvent {
  kind: TimelineEventKind;
  at: string; // ISO
  title: string;
  inspectionId: string;
}

export interface TimelineInspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  claimType: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface TimelineComms {
  inspectionId: string;
  createdAt: Date;
  status: string;
  eventType: string;
}

const CLAIM_LABEL: Record<string, string> = {
  WATER: "Water damage",
  FIRE: "Fire and smoke",
  MOULD: "Mould",
  STORM: "Storm",
  CONTENTS: "Contents",
  BIOHAZARD: "Biohazard",
  ODOUR: "Odour",
  CARPET: "Carpet",
  HVAC: "HVAC",
  ASBESTOS: "Asbestos",
};

const EMAIL_LABEL: Record<string, string> = {
  STEP_TRANSITION: "Job progress update emailed",
  DRYING_GOAL_CHANGE: "Drying update emailed",
  DAILY_DIGEST: "Daily summary emailed",
  REVIEW_ASK: "Review request emailed",
};

export const MAX_TIMELINE_EVENTS = 100;

export function buildClientTimeline(inspections: TimelineInspection[], comms: TimelineComms[]): TimelineEvent[] {
  const byId = new Map(inspections.map((i) => [i.id, i]));
  const events: TimelineEvent[] = [];
  for (const i of inspections) {
    const what = i.claimType ? CLAIM_LABEL[i.claimType] ?? "Restoration" : "Restoration";
    events.push({
      kind: "job_opened",
      at: i.createdAt.toISOString(),
      title: `${what} job ${i.inspectionNumber} opened at ${i.propertyAddress}`,
      inspectionId: i.id,
    });
    if (i.completedAt) {
      events.push({
        kind: "job_completed",
        at: i.completedAt.toISOString(),
        title: `Job ${i.inspectionNumber} completed`,
        inspectionId: i.id,
      });
    }
  }
  for (const c of comms) {
    const job = byId.get(c.inspectionId);
    if (!job || c.status !== "SENT") continue; // suppressed emails never reached the client
    events.push({
      kind: "email_sent",
      at: c.createdAt.toISOString(),
      title: `${EMAIL_LABEL[c.eventType] ?? "Update emailed"} (${job.inspectionNumber})`,
      inspectionId: c.inspectionId,
    });
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, MAX_TIMELINE_EVENTS);
}
