import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await (prisma as any).scopeTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        claimType: t.claimType,
        items: t.items ? JSON.parse(t.items) : [],
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        _count: { items: t.items ? JSON.parse(t.items).length : 0 },
      })),
    );
  } catch (error: any) {
    console.error("[scope-templates] GET error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch scope templates",
        details:
          process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, claimType, items } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const template = await (prisma as any).scopeTemplate.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        description: description?.trim() || null,
        claimType: claimType || null,
        items: items ? JSON.stringify(items) : null,
      },
    });

    return NextResponse.json(
      {
        id: template.id,
        name: template.name,
        description: template.description,
        claimType: template.claimType,
        items: template.items ? JSON.parse(template.items) : [],
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        _count: {
          items: template.items ? JSON.parse(template.items).length : 0,
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[scope-templates] POST error:", error);
    return NextResponse.json(
      {
        error: "Failed to create scope template",
        details:
          process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 },
    );
  }
}
