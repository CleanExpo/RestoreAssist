/**
 * RA-8495 (DRC S2) — the organisation's own job number, e.g. `DRC-0001`.
 *
 * One owner for the rule. Every caller allocates through `allocateJobNumber`
 * on the transaction client of the job it is creating, so:
 *
 * - two saves at once serialise on the organisation's counter row (the
 *   INSERT .. ON CONFLICT DO UPDATE takes a row lock until commit), and
 * - a save that rolls back releases its number (the increment rolls back too).
 *
 * No yearly restart (reversible default; an open DRC question). The prefix is
 * frozen into `Organization.jobNumberPrefix` on first allocation, so renaming
 * the organisation later does not change the prefix of new jobs.
 *
 * If a save ever fails with a unique violation on
 * (jobNumberOrganizationId, jobNumber), the counter is behind the data (a
 * restore of one table, or a manual reset). Repair: set
 * OrganizationJobSequence.lastValue to the highest number already issued for
 * that organisation. Until then every save in that organisation fails, so the
 * intake route logs it as JOB_NUMBER_COLLISION.
 */
import type { Prisma } from "@prisma/client";

/** Words that are legal form or location noise, never part of a short code. */
const NOISE_WORDS = new Set([
  "PTY",
  "LTD",
  "LIMITED",
  "PROPRIETARY",
  "INC",
  "CO",
  "COMPANY",
  "THE",
  "AND",
  "OF",
  "TRUST",
  "TRUSTEE",
  "FOR",
  "AU",
  "NZ",
]);

export const DEFAULT_JOB_NUMBER_PREFIX = "JOB";
export const JOB_NUMBER_PREFIX_PATTERN = /^[A-Z0-9]{2,10}$/;
const PAD = 4;

/**
 * The prefix an organisation gets when nobody has set one.
 *
 * "DRC (NSW) Pty Ltd" -> "DRC": a leading word already written as a short
 * code (2 to 5 capitals) wins. Otherwise the initials of the first three
 * meaningful words ("Coastal Water Restorations" -> "CWR"). Bracketed parts
 * such as a state are ignored. Falls back to "JOB".
 */
export function deriveJobNumberPrefix(organisationName: string | null | undefined): string {
  const withoutBrackets = (organisationName ?? "").replace(/\([^)]*\)/g, " ");
  const words = withoutBrackets
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .filter((w) => !NOISE_WORDS.has(w.toUpperCase()));
  if (words.length === 0) return DEFAULT_JOB_NUMBER_PREFIX;
  const first = words[0];
  if (/^[A-Z]{2,5}$/.test(first)) return first;
  const initials = words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("")
    .replace(/[^A-Z0-9]/g, "");
  return initials.length >= 2 ? initials : DEFAULT_JOB_NUMBER_PREFIX;
}

/** Normalise an admin-entered prefix; null when it is not acceptable. */
export function normaliseJobNumberPrefix(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toUpperCase();
  return JOB_NUMBER_PREFIX_PATTERN.test(value) ? value : null;
}

export function formatJobNumber(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(PAD, "0")}`;
}

export interface AllocatedJobNumber {
  jobNumber: string;
  prefix: string;
  value: number;
}

/**
 * Take the organisation's next job number inside the caller's transaction.
 * Must be passed the transaction client (`tx`), never the global client:
 * otherwise a rolled-back save would still consume its number.
 */
export async function allocateJobNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<AllocatedJobNumber> {
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "OrganizationJobSequence" ("organizationId", "lastValue", "updatedAt")
    VALUES (${organizationId}, 1, now())
    ON CONFLICT ("organizationId") DO UPDATE
      SET "lastValue" = "OrganizationJobSequence"."lastValue" + 1,
          "updatedAt" = now()
    RETURNING "lastValue"`;
  const value = Number(rows[0]?.lastValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Job number allocation returned no value");
  }

  // Read the prefix after the counter row is locked, so the number and the
  // prefix come from the same moment. Freeze a derived prefix on first use.
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, jobNumberPrefix: true },
  });
  if (!org) throw new Error("Organisation not found for job number allocation");
  let prefix = org.jobNumberPrefix;
  if (!prefix) {
    prefix = deriveJobNumberPrefix(org.name);
    await tx.organization.update({
      where: { id: organizationId },
      data: { jobNumberPrefix: prefix },
    });
  }
  return { jobNumber: formatJobNumber(prefix, value), prefix, value };
}

/**
 * The prefix and the next number an organisation would get. An estimate only:
 * it takes no lock, so two people can see the same preview. The number a job
 * actually receives is the one the save returns.
 */
export async function previewJobNumber(
  db: Pick<Prisma.TransactionClient, "organization" | "organizationJobSequence">,
  organizationId: string,
): Promise<{ prefix: string; derived: boolean; nextJobNumber: string } | null> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, jobNumberPrefix: true },
  });
  if (!org) return null;
  const seq = await db.organizationJobSequence.findUnique({
    where: { organizationId },
    select: { lastValue: true },
  });
  const prefix = org.jobNumberPrefix ?? deriveJobNumberPrefix(org.name);
  return {
    prefix,
    derived: !org.jobNumberPrefix,
    nextJobNumber: formatJobNumber(prefix, (seq?.lastValue ?? 0) + 1),
  };
}
