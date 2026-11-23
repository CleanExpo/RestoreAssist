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

/**
 * Mining pilot slice 6: change or remove one training record. Owner or manager
 * only, and only a record in their own organisation: every read and write here
 * carries `trainingWriteWhere`, so another organisation's record is a 404.
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
    const parsed = updateTrainingRecordSchema.safeParse(body);
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
      select: { completedOn: true, expiresOn: true },
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

    // The scope is applied again in the write itself, not only in the read above.
    const result = await prisma.staffTrainingRecord.updateMany({
      where,
      data,
    });
    if (result.count === 0) return notFound(request, stage);

    const updated = await prisma.staffTrainingRecord.findFirst({
      where,
      select: trainingRecordSelect,
    });
    if (!updated) return notFound(request, stage);
    return NextResponse.json({ data: { record: toTrainingRecordDto(updated) } });
  } catch (err) {
    return fromException(request, err, { stage });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const stage = "training-records-delete";
  try {
    const editor = await editorOr(request, stage);
    if (editor instanceof NextResponse) return editor;
    const { id } = await params;

    const result = await prisma.staffTrainingRecord.deleteMany({
      where: trainingWriteWhere(editor, id),
    });
    if (result.count === 0) return notFound(request, stage);
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    return fromException(request, err, { stage });
  }
}
