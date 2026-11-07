import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { ORGANIZATION_PROFILE_FIELDS } from "@/lib/organization/profile-fields";

const profileSelect = {
  legalName: true,
  tradingName: true,
  state: true,
  address: true,
  phone: true,
  email: true,
  website: true,
  logoUrl: true,
  primaryColor: true,
  accentColor: true,
  aboutCopy: true,
  country: true,
  abn: true,
  nzbn: true,
} as const;

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(undefined, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const organization = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: profileSelect,
  });
  if (!organization) {
    return apiError(undefined, {
      code: "NOT_FOUND",
      message: "Organization not found",
      status: 404,
    });
  }

  return NextResponse.json({ data: organization });
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const org = await prisma.organization.findFirst({
      where: { ownerId: session.user.id },
      select: { id: true },
    });
    if (!org) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Organization not found",
        status: 404,
      });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, string | null> = {};

    for (const field of ORGANIZATION_PROFILE_FIELDS) {
      if (!(field in body)) continue;
      const v = body[field];
      if (v === null || v === undefined || v === "") {
        patch[field] = null;
        continue;
      }
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (
        (field === "primaryColor" || field === "accentColor") &&
        trimmed &&
        !isHexColor(trimmed.startsWith("#") ? trimmed : `#${trimmed}`)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: `${field} must be a 6-digit hex colour such as #1C2E47`,
          status: 400,
        });
      }
      if (field === "primaryColor" || field === "accentColor") {
        patch[field] = trimmed.startsWith("#")
          ? trimmed.toUpperCase()
          : `#${trimmed.toUpperCase()}`;
        continue;
      }
      patch[field] = trimmed;
    }

    if (Object.keys(patch).length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No profile fields to update",
        status: 400,
      });
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: patch,
      select: profileSelect,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fromException(request, error, { stage: "organization/profile:patch" });
  }
}
