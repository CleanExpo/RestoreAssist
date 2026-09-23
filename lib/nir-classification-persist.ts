/**
 * RA-7709 — the single writer for an inspection's Classification row.
 *
 * An inspection has one classification: the newest row, which is what every
 * `classifications[0]` reader already shows. Writers update that row, or
 * create it when there is none, so a retried submit, a second affected area or
 * a later job-page edit cannot append another.
 *
 * Call inside a transaction. There is no unique index on
 * Classification.inspectionId yet, so two concurrent writers for the same
 * inspection can still both create; see the RA-7709 report for the migration.
 */
import type { Prisma } from "@prisma/client";

type ClassificationDb = Pick<Prisma.TransactionClient, "classification">;

export interface ClassificationWrite {
  category: string;
  class: string;
  justification: string;
  standardReference: string;
  confidence: number | null;
  inputData: string | null;
  isFinal: boolean;
  /** User id when the technician chose the classification; null when automatic. */
  reviewedBy: string | null;
}

export async function persistInspectionClassification(
  db: ClassificationDb,
  inspectionId: string,
  data: ClassificationWrite,
) {
  const existing = await db.classification.findFirst({
    where: { inspectionId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    return db.classification.update({ where: { id: existing.id }, data });
  }
  return db.classification.create({ data: { inspectionId, ...data } });
}

/** The technician's saved choice for this inspection, if they made one. */
export async function findTechnicianClassification(
  db: ClassificationDb,
  inspectionId: string,
) {
  const latest = await db.classification.findFirst({
    where: { inspectionId },
    orderBy: { createdAt: "desc" },
    select: {
      category: true,
      class: true,
      justification: true,
      standardReference: true,
      confidence: true,
      reviewedBy: true,
    },
  });
  return latest?.reviewedBy ? latest : null;
}
