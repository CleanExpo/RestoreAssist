import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DEFAULT_FORM_TEMPLATES } from "@/lib/form-templates-defaults"

// GET - List active form templates for current user. Auto-seeds default templates if user has none.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let templates = await prisma.formTemplate.findMany({
      where: {
        OR: [
          { userId: session.user.id },
          { isSystemTemplate: true },
        ],
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        formType: true,
        category: true,
        description: true,
      },
      orderBy: [
        { isSystemTemplate: "desc" },
        { name: "asc" },
      ],
    })

    // Auto-seed default templates for this user if they have none
    if (templates.length === 0) {
      const userId = session.user.id
      for (const t of DEFAULT_FORM_TEMPLATES) {
        const existing = await prisma.formTemplate.findFirst({
          where: { userId, name: t.name },
        })
        if (existing) continue
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
        })
      }
      templates = await prisma.formTemplate.findMany({
        where: {
          OR: [
            { userId: session.user.id },
            { isSystemTemplate: true },
          ],
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          formType: true,
          category: true,
          description: true,
        },
        orderBy: [
          { isSystemTemplate: "desc" },
          { name: "asc" },
        ],
      })
    }

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("Error fetching form templates:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
