import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FormCategory, FormType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_FORM_TEMPLATES } from "@/lib/form-templates-defaults";
import { apiError, fromException } from "@/lib/api-errors";
import { canManageFormTemplates } from "@/lib/form-templates/can-manage";

const EMPTY_FORM_SCHEMA = JSON.stringify({ sections: [], fields: [] });

// RA-7957: what both create screens send. `.strict()` refuses any field the
// server owns — userId, createdBy, workspaceId, isSystemTemplate, isActive —
// so a caller cannot place a template in another business or mark it system.
const createTemplateBody = z
  .object({
    name: z.string().trim().min(1, "Template name is required").max(200),
    formType: z.enum(FormType),
    category: z.enum(FormCategory).default("CUSTOM"),
    description: z.string().trim().max(10_000).nullable().optional(),
    requiresSignatures: z.boolean().default(false),
    status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
    formSchema: z
      .string()
      .max(100_000)
      .refine((text) => {
        try {
          const parsed: unknown = JSON.parse(text);
          return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
        } catch {
          return false;
        }
      }, "formSchema must be a JSON object")
      .default(EMPTY_FORM_SCHEMA),
  })
  .strict();

// GET - List active form templates for current user. Auto-seeds default templates if user has none.
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

    let templates = await prisma.formTemplate.findMany({
      where: {
        OR: [{ userId: session.user.id }, { isSystemTemplate: true }],
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        formType: true,
        category: true,
        description: true,
      },
      orderBy: [{ isSystemTemplate: "desc" }, { name: "asc" }],
      take: 200, // CLAUDE.md rule 4
    });

    // Auto-seed default templates for this user if they have none
    if (templates.length === 0) {
      const userId = session.user.id;
      for (const t of DEFAULT_FORM_TEMPLATES) {
        const existing = await prisma.formTemplate.findFirst({
          where: { userId, name: t.name },
        });
        if (existing) continue;
        await prisma.formTemplate.create({
          data: {
            userId,
            createdBy: userId,
            name: t.name,
            formType: t.formType,
            category: t.category,
            description: t.description ?? null,
            formSchema: t.formSchema,
            status: t.status,
            isSystemTemplate: false,
            isActive: true,
            requiresSignatures: t.requiresSignatures,
            signatureConfig: t.signatureConfig,
          },
        });
      }
      templates = await prisma.formTemplate.findMany({
        where: {
          OR: [{ userId: session.user.id }, { isSystemTemplate: true }],
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          formType: true,
          category: true,
          description: true,
        },
        orderBy: [{ isSystemTemplate: "desc" }, { name: "asc" }],
        take: 200,
      });
    }

    return NextResponse.json({ templates });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}

// POST - Create a template owned by the signed-in user (RA-7957).
// Only ADMIN or MANAGER, with the role re-read from the database.
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
    const userId = session.user.id;

    if (!(await canManageFormTemplates(userId))) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only an owner or manager can create form templates",
        status: 403,
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request body must be valid JSON",
        status: 400,
      });
    }
    const parsed = createTemplateBody.safeParse(body);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid template",
        status: 400,
      });
    }

    const { description, ...fields } = parsed.data;
    const template = await prisma.formTemplate.create({
      data: {
        ...fields,
        description: description || null,
        userId,
        createdBy: userId,
        isSystemTemplate: false,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        formType: true,
        category: true,
        status: true,
        formSchema: true,
        requiresSignatures: true,
        isActive: true,
      },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "create" });
  }
}
