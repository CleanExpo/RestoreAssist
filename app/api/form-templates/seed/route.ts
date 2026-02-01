import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DEFAULT_FORM_TEMPLATES } from "@/lib/form-templates-defaults"

/**
 * POST - Create default form templates for the current user.
 * Idempotent: skips templates that already exist by name for this user.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    let created = 0

    for (const t of DEFAULT_FORM_TEMPLATES) {
      const existing = await prisma.formTemplate.findFirst({
        where: {
          userId,
          name: t.name,
        },
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
      created++
    }

    return NextResponse.json({
      message: created === 0 ? "All default templates already exist." : `${created} default form template(s) created.`,
      created,
      total: DEFAULT_FORM_TEMPLATES.length,
    })
  } catch (error) {
    console.error("Error seeding form templates:", error)
    return NextResponse.json({ error: "Failed to create templates" }, { status: 500 })
  }
}
