import { formatDateOnly } from "@/lib/training/record-input";

/** The columns every training-records response reads. One owner, so GET and writes match. */
export const trainingRecordSelect = {
  id: true,
  staffUserId: true,
  course: true,
  provider: true,
  completedOn: true,
  expiresOn: true,
  evidenceUrl: true,
  carsiCompletionRef: true,
  updatedAt: true,
  staffUser: { select: { name: true, email: true } },
} as const;

export interface TrainingRecordRow {
  id: string;
  staffUserId: string;
  course: string;
  provider: string;
  completedOn: Date;
  expiresOn: Date | null;
  evidenceUrl: string | null;
  carsiCompletionRef: string | null;
  updatedAt: Date;
  staffUser: { name: string | null; email: string } | null;
}

export interface TrainingRecordDto {
  id: string;
  staffUserId: string;
  staffName: string;
  course: string;
  provider: string;
  completedOn: string;
  expiresOn: string | null;
  evidenceUrl: string | null;
  carsiCompletionRef: string | null;
  updatedAt: string;
}

export function toTrainingRecordDto(row: TrainingRecordRow): TrainingRecordDto {
  return {
    id: row.id,
    staffUserId: row.staffUserId,
    staffName: row.staffUser?.name || row.staffUser?.email || "Staff member",
    course: row.course,
    provider: row.provider,
    completedOn: formatDateOnly(row.completedOn),
    expiresOn: row.expiresOn ? formatDateOnly(row.expiresOn) : null,
    evidenceUrl: row.evidenceUrl,
    carsiCompletionRef: row.carsiCompletionRef,
    updatedAt: row.updatedAt.toISOString(),
  };
}
