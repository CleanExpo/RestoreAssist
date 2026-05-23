/**
 * Pure validation for an inspection-submission attempt.
 *
 * Action layer (app/api/inspections/[id]/submit/route.ts) handles:
 *   - auth, ownership, status persistence, audit logging, HTTP mapping.
 * This service answers: given an Inspection-shaped payload already loaded
 * from the DB, is it valid to submit?
 *
 * No DB reads, no I/O — pure function for predictability + testability.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

export type SubmissionValidationReason =
  | "INVALID_STATUS"
  | "MISSING_AFFECTED_AREAS"
  | "MISSING_MOISTURE_READINGS"
  | "MISSING_PHOTOS";

export interface SubmissionPayload {
  id: string;
  status: string;
  affectedAreas: { id: string }[];
  moistureReadings: { id: string }[];
  photos: { id: string }[];
}

export function validateSubmissionPayload(
  payload: SubmissionPayload,
): ServiceResult<true, SubmissionValidationReason> {
  if (payload.status !== "DRAFT") {
    return fail("INVALID_STATUS", {
      detail: `Inspection is in '${payload.status}', expected 'DRAFT'`,
    });
  }
  if (payload.affectedAreas.length === 0) {
    return fail("MISSING_AFFECTED_AREAS");
  }
  if (payload.moistureReadings.length === 0) {
    return fail("MISSING_MOISTURE_READINGS");
  }
  if (payload.photos.length === 0) {
    return fail("MISSING_PHOTOS");
  }
  return ok(true);
}
