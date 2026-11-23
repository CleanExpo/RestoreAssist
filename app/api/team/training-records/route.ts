import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  canEditTraining,
  resolveTrainingViewer,
  staffMemberWhere,
  trainingReadWhere,
} from "@/lib/training/register-access";
import {
  createTrainingRecordSchema,
  fieldErrors,
  parseDateOnly,
} from "@/lib/training/record-input";
import {
  toTrainingRecordDto,
  trainingRecordSelect,
} from "@/lib/training/serialise";

/**
 * Mining pilot slice 6: the staff training register.
 *
 * GET  lists the records the caller may read (lib/training/register-access.ts).
 * POST adds a record for a current member of the caller's organisation; owner
 *      or manager only.
 *
 * Nothing here calls CARSI or opens a stored link.
 */

const LIST_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const viewer = await resolveTrainingViewer(session.user.id);
    const where = trainingReadWhere(viewer);
    if (!where) {
      return NextResponse.json({
        data: {
          records: [],
          staff: [],
          canEdit: false,
          truncated: false,
          noOrganisation: true,
        },
      });
    }

    const rows = await prisma.staffTrainingRecord.findMany({
      where,
      select: trainingRecordSelect,
      orderBy: [{ completedOn: "desc" }, { id: "asc" }],
      take: LIST_LIMIT + 1,
    });
    const truncated = rows.length > LIST_LIMIT;

    const staff = canEditTraining(viewer)
      ? await prisma.user.findMany({
          where: staffMemberWhere(viewer),
          select: { id: true, name: true, email: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: LIST_LIMIT,
        })
      : [];

    return NextResponse.json({
      data: {
        records: rows.slice(0, LIST_LIMIT).map(toTrainingRecordDto),
        staff: staff.map((s) => ({
          id: s.id,
          name: s.name || s.email,
        })),
        canEdit: canEditTraining(viewer),
        truncated,
        noOrganisation: false,
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "training-records-get" });
  }
}

export async function POST(request: NextRequest) {
  try {
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
        message: "Only an owner or manager can add training records",
        status: 403,
        stage: "training-records-post",
      });
    }

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
    const parsed = createTrainingRecordSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Check the training record",
        status: 400,
        fields: fieldErrors(parsed.error),
      });
    }
    const input = parsed.data;

    const member = await prisma.user.findFirst({
      where: staffMemberWhere(viewer, input.staffUserId),
      select: { id: true },
    });
    if (!member) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Staff member not found in your organisation",
        status: 404,
        stage: "training-records-post",
      });
    }

    const created = await prisma.staffTrainingRecord.create({
      data: {
        organizationId: viewer.organizationId,
        staffUserId: member.id,
        course: input.course,
        provider: input.provider,
        completedOn: parseDateOnly(input.completedOn)!,
        expiresOn: input.expiresOn ? parseDateOnly(input.expiresOn) : null,
        evidenceUrl: input.evidenceUrl ?? null,
        carsiCompletionRef: input.carsiCompletionRef ?? null,
        recordedByUserId: viewer.userId,
        updatedByUserId: viewer.userId,
      },
      select: trainingRecordSelect,
    });

    return NextResponse.json(
      { data: { record: toTrainingRecordDto(created) } },
      { status: 201 },
    );
  } catch (err) {
    return fromException(request, err, { stage: "training-records-post" });
  }
}
