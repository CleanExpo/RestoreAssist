import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/credential-vault";
import { apiError, fromException } from "@/lib/api-errors";
import { validateResendApiKey } from "@/lib/email/resolve-resend-config";

const putSchema = z.object({
  apiKey: z.string().trim().min(10).max(200),
  fromAddress: z
    .string()
    .trim()
    .max(320)
    .optional()
    .transform((v) => v ?? ""),
});

async function requireOrgOwner(sessionUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { organizationId: true, role: true },
  });
  if (!user?.organizationId) return null;
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      id: true,
      ownerId: true,
      emailProvider: true,
      emailFromAddress: true,
      emailProviderEncryptedKey: true,
    },
  });
  if (!org) return null;
  // Owner or ADMIN may manage org email BYOK
  if (org.ownerId !== sessionUserId && user.role !== "ADMIN") return null;
  return org;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const org = await requireOrgOwner(session.user.id);
    if (!org) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Organization email settings require owner access",
        status: 403,
      });
    }

    return NextResponse.json({
      connected: org.emailProvider === "RESEND" && !!org.emailProviderEncryptedKey,
      provider: org.emailProvider,
      fromAddress: org.emailFromAddress,
      hasPlatformFallback: !!process.env.RESEND_API_KEY,
    });
  } catch (error) {
    return fromException(request, error, { stage: "email-settings-get" });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const org = await requireOrgOwner(session.user.id);
    if (!org) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Organization email settings require owner access",
        status: 403,
      });
    }

    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid request",
        status: 400,
      });
    }

    const ok = await validateResendApiKey(parsed.data.apiKey);
    if (!ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Resend API key could not be validated",
        status: 400,
      });
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        emailProvider: "RESEND",
        emailProviderEncryptedKey: encrypt(parsed.data.apiKey),
        emailFromAddress: parsed.data.fromAddress || null,
      },
    });

    return NextResponse.json({ connected: true, provider: "RESEND" });
  } catch (error) {
    return fromException(request, error, { stage: "email-settings-put" });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const org = await requireOrgOwner(session.user.id);
    if (!org) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Organization email settings require owner access",
        status: 403,
      });
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        emailProvider: null,
        emailProviderEncryptedKey: null,
        emailFromAddress: null,
      },
    });

    return NextResponse.json({ connected: false });
  } catch (error) {
    return fromException(request, error, { stage: "email-settings-delete" });
  }
}
