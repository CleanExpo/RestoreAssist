import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { FormType } from "@prisma/client";
import { canManageFormTemplates } from "@/lib/form-templates/can-manage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch a single form template by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const template = await prisma.formTemplate.findFirst({
      where: {
        id,
        OR: [{ userId: session.user.id }, { isSystemTemplate: true }],
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        formType: true,
        category: true,
        status: true,
        isSystemTemplate: true,
        version: true,
        requiresSignatures: true,
        formSchema: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!template) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Template not found",
        status: 404,
      });
    }

    // Parse formSchema and extract questions/fields
    let questions: {
      id: string;
      order: number;
      questionText: string;
      questionType: string;
      isRequired: boolean;
    }[] = [];

    try {
      const schema = JSON.parse(template.formSchema);
      if (schema?.sections && Array.isArray(schema.sections)) {
        let order = 1;
        for (const section of schema.sections) {
          if (section?.fields && Array.isArray(section.fields)) {
            for (const field of section.fields) {
              questions.push({
                id: field.id ?? `field-${order}`,
                order: order++,
                questionText: field.label ?? field.id ?? "Unnamed field",
                questionType: (field.type ?? "TEXT").toUpperCase(),
                isRequired: field.required === true,
              });
            }
          }
        }
      }
    } catch {
      // formSchema is not valid JSON — return empty questions
    }

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        description: template.description ?? undefined,
        formType: template.formType,
        category: template.category,
        status: template.status,
        isDefault: template.isSystemTemplate,
        version: template.version,
        requiresSignatures: template.requiresSignatures,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
        questions,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "get" });
  }
}

// PATCH - Update a form template's metadata
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // RA-7957: same gate as create and archive.
    if (!(await canManageFormTemplates(session.user.id))) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only an owner or manager can change form templates",
        status: 403,
      });
    }

    const { id } = await params;

    // Only the owner can update (not system templates)
    const existing = await prisma.formTemplate.findFirst({
      where: {
        id,
        userId: session.user.id,
        isActive: true,
      },
    });

    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Template not found or not editable",
        status: 404,
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request body must be valid JSON",
        status: 400,
      });
    }
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request body must be a JSON object",
        status: 400,
      });
    }
    const { name, description, formType } = rawBody as Record<string, any>;

    // Validate required fields
    if (name !== undefined && typeof name !== "string") {
      return apiError(request, {
        code: "VALIDATION",
        message: "name must be a string",
        status: 400,
      });
    }
    if (name !== undefined && name.trim().length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "name cannot be empty",
        status: 400,
      });
    }

    if (
      formType !== undefined &&
      !(Object.values(FormType) as unknown[]).includes(formType)
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: "formType is not a known form type",
        status: 400,
      });
    }

    const updated = await prisma.formTemplate.update({
      where: { id, userId: session.user.id, isActive: true },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: description || null }
          : {}),
        ...(formType !== undefined ? { formType } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        formType: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ template: updated });
  } catch (error) {
    return fromException(request, error, { stage: "patch" });
  }
}

// DELETE - Archive an active, non-system template owned by this user (RA-7957).
// Archive, never hard-delete: form submissions, interview sessions and versions
// keep the template they were made from. Only ADMIN or MANAGER.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    if (!(await canManageFormTemplates(session.user.id))) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only an owner or manager can remove form templates",
        status: 403,
      });
    }

    const { id } = await params;
    // Ownership, system and active checks sit on the write itself, so another
    // user's template (any business) matches nothing and is a 404.
    const result = await prisma.formTemplate.updateMany({
      where: {
        id,
        userId: session.user.id,
        isSystemTemplate: false,
        isActive: true,
      },
      data: { isActive: false, status: "ARCHIVED" },
    });
    if (result.count === 0) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Template not found or not removable",
        status: 404,
      });
    }
    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    return fromException(request, error, { stage: "archive" });
  }
}
