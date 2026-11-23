import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  canEditTraining,
  resolveTrainingViewer,
  trainingWriteWhere,
  type TrainingEditor,
} from "@/lib/training/register-access";
import {
  fieldErrors,
  formatDateOnly,
  parseDateOnly,
  updateTrainingRecordSchema,
} from "@/lib/training/record-input";
import {
  toTrainingRecordDto,
  trainingRecordSelect,
} from "@/lib/training/serialise";
import { parseExpectedVersion, versionWhere } from "@/lib/training/version";

/**
 * Mining pilot slice 6: change or remove one training record. Owner or manager
 * only, and only a record in their own organisation: every read and write here
 * carries `trainingWriteWhere`, so another organisation's record is a 404.
 *
 * Both carry the record's `updatedAt` as the caller last saw it
 * (lib/training/version.ts). If someone else changed the record since, nothing
 * is written and the answer is 409, so no change is silently lost.
 */

type Params = { params: Promise<{ id: string }> };

async function editorOr(
  request: NextRequest,
  stage: string,
): Promise<TrainingEditor | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const viewer = await resolveTrainingViewer(session.user.id);
  if (!canEditTraining(viewer)) {
    return apiError(request, {
      code: "FORBIDDEN",
      message: "Only an owner or manager can change training records",
      status: 403,
      stage,
    });
  }
  return viewer;
}

function notFound(request: NextRequest, stage: string) {
  return apiError(request, {
    code: "NOT_FOUND",
    message: "Training record not found",
    status: 404,
    stage,
  });
}

function changedElsewhere(request: NextRequest, stage: string) {
  return apiError(request, {
    code: "CONFLICT",
    message:
      "Someone else changed this record after you opened it. Reload to see their change, then try again.",
    status: 409,
    stage,
  });
}

function badVersion(request: NextRequest) {
  return apiError(request, {
    code: "VALIDATION",
    message: "Check the training record",
    status: 400,
    fields: {
      expectedUpdatedAt: "The version of the record you are changing is required",
    },
  });
}

/** A write that matched nothing: gone (404), or changed by someone else (409). */
async function missOutcome(
  request: NextRequest,
  stage: string,
  editor: TrainingEditor,
  id: string,
) {
  const still = await prisma.staffTrainingRecord.findFirst({
    where: trainingWriteWhere(editor, id),
    select: { id: true },
  });
  return still ? changedElsewhere(request, stage) : notFound(request, stage);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const stage = "training-records-patch";
  try {
    const editor = await editorOr(request, stage);
    if (editor instanceof NextResponse) return editor;
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Body must be JSON",
        status: 400,
      });
    }
    const { expectedUpdatedAt, ...changes } =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const expected = parseExpectedVersion(expectedUpdatedAt);
    if (!expected) return badVersion(request);

    const parsed = updateTrainingRecordSchema.safeParse(changes);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Check the training record",
        status: 400,
        fields: fieldErrors(parsed.error),
      });
    }
    const input = parsed.data;
    if (Object.values(input).every((v) => v === undefined)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Nothing to change",
        status: 400,
      });
    }

    const where = trainingWriteWhere(editor, id);
    const current = await prisma.staffTrainingRecord.findFirst({
      where,
      select: { completedOn: true, expiresOn: true, updatedAt: true },
    });
    if (!current) return notFound(request, stage);

    const completedOn =
      input.completedOn ?? formatDateOnly(current.completedOn);
    const expiresOn =
      input.expiresOn === undefined
        ? current.expiresOn
          ? formatDateOnly(current.expiresOn)
          : null
        : input.expiresOn;
    if (expiresOn && expiresOn < completedOn) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Check the training record",
        status: 400,
        fields: { expiresOn: "Expiry cannot be before completion" },
      });
    }

    const data: Record<string, unknown> = { updatedByUserId: editor.userId };
    if (input.course !== undefined) data.course = input.course;
    if (input.provider !== undefined) data.provider = input.provider;
    if (input.completedOn !== undefined)
      data.completedOn = parseDateOnly(input.completedOn);
    if (input.expiresOn !== undefined)
      data.expiresOn = input.expiresOn ? parseDateOnly(input.expiresOn) : null;
    if (input.evidenceUrl !== undefined)
      data.evidenceUrl = input.evidenceUrl ?? null;
    if (input.carsiCompletionRef !== undefined)
      data.carsiCompletionRef = input.carsiCompletionRef ?? null;

    // Scope and version are applied again in the write itself: a record moved
    // or changed since the read above is not written.
    const result = await prisma.staffTrainingRecord.updateMany({
      where: { AND: [where, versionWhere(expected)] },
      data,
    });
    if (result.count === 0) return missOutcome(request, stage, editor, id);

    const updated = await prisma.staffTrainingRecord.findFirst({
      where,
      select: trainingRecordSelect,
    });
    if (!updated) return notFound(request, stage);
    return NextResponse.json({ data: { record: toTrainingRecordDto(updated) } });
  } catch (err) {
    // Defence in depth: the database's own expiry check (migration) is a
    // conflict for the caller, not a server fault.
    if (String((err as Error)?.message ?? "").includes("StaffTrainingRecord_expiry_check")) {
      return changedElsewhere(request, stage);
    }
    return fromException(request, err, { stage });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const stage = "training-records-delete";
  try {
    const editor = await editorOr(request, stage);
    if (editor instanceof NextResponse) return editor;
    const { id } = await params;
    const expected = parseExpectedVersion(
      request.nextUrl.searchParams.get("expectedUpdatedAt"),
    );
    if (!expected) return badVersion(request);

    const result = await prisma.staffTrainingRecord.deleteMany({
      where: { AND: [trainingWriteWhere(editor, id), versionWhere(expected)] },
    });
    if (result.count === 0) return missOutcome(request, stage, editor, id);
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    return fromException(request, err, { stage });
  }
}
