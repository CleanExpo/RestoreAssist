import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Mining pilot slice 6: who may see and change the staff training register.
 *
 * This file is the one owner of the rule. Every training-records route calls
 * `resolveTrainingViewer` and then `trainingReadWhere` / `trainingWriteWhere`;
 * none re-derives the organisation or the role.
 *
 * - ADMIN (the business owner) and MANAGER: read and change every record in
 *   their organisation.
 * - USER (a technician): read their own records in their current
 *   organisation, and change nothing.
 * - No user row, or no organisation: read nothing, change nothing.
 *
 * Role and organisation are re-read from the database on every request, never
 * taken from the session: the JWT carries a role for up to 90 days and a
 * demotion does not rewrite it (.claude/RULES.md rule 3).
 */

export type TrainingViewer =
  | { kind: "none"; userId: string }
  | {
      kind: "editor";
      userId: string;
      organizationId: string;
      role: "ADMIN" | "MANAGER";
    }
  | { kind: "self"; userId: string; organizationId: string };

export type TrainingEditor = Extract<TrainingViewer, { kind: "editor" }>;

/** Pure: turns the database row into a viewer. Exported for tests. */
export function viewerFromUserRow(
  userId: string,
  row: { role: string | null; organizationId: string | null } | null,
): TrainingViewer {
  if (!row || !row.organizationId) return { kind: "none", userId };
  if (row.role === "ADMIN" || row.role === "MANAGER") {
    return {
      kind: "editor",
      userId,
      organizationId: row.organizationId,
      role: row.role,
    };
  }
  if (row.role === "USER") {
    return { kind: "self", userId, organizationId: row.organizationId };
  }
  return { kind: "none", userId };
}

export async function resolveTrainingViewer(
  userId: string,
): Promise<TrainingViewer> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, organizationId: true },
  });
  return viewerFromUserRow(userId, row);
}

/** The filter every read applies. Null means the viewer may read nothing. */
export function trainingReadWhere(
  viewer: TrainingViewer,
): Prisma.StaffTrainingRecordWhereInput | null {
  switch (viewer.kind) {
    case "editor":
      return { organizationId: viewer.organizationId };
    case "self":
      return {
        organizationId: viewer.organizationId,
        staffUserId: viewer.userId,
      };
    default:
      return null;
  }
}

export function canEditTraining(
  viewer: TrainingViewer,
): viewer is TrainingEditor {
  return viewer.kind === "editor";
}

/** The filter every update and delete applies: one record, in the editor's organisation. */
export function trainingWriteWhere(
  editor: TrainingEditor,
  recordId: string,
): Prisma.StaffTrainingRecordWhereInput {
  return { id: recordId, organizationId: editor.organizationId };
}

/**
 * The staff an editor may record training for: current members of their
 * organisation. Used for the create check and the staff picker.
 */
export function staffMemberWhere(
  editor: TrainingEditor,
  staffUserId?: string,
): Prisma.UserWhereInput {
  return staffUserId
    ? { id: staffUserId, organizationId: editor.organizationId }
    : { organizationId: editor.organizationId };
}
