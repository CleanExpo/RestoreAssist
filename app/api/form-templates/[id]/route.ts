import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch a single form template by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
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
    console.error("Error fetching form template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PATCH - Update a form template's metadata
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json(
        { error: "Template not found or not editable" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { name, description, formType } = body;

    // Validate required fields
    if (name !== undefined && typeof name !== "string") {
      return NextResponse.json(
        { error: "name must be a string" },
        { status: 400 },
      );
    }
    if (name !== undefined && name.trim().length === 0) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 },
      );
    }

    const updated = await prisma.formTemplate.update({
      where: { id },
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
    console.error("Error updating form template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
