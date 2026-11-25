import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { ORGANIZATION_PROFILE_FIELDS } from "@/lib/organization/profile-fields";
import { resolveOwnedProfileOrganizationId } from "@/lib/organization/owned-profile-organization";
import { parseEmail } from "@/lib/validation/email";

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

  // RA-8516: the same organisation PATCH saves to, never an arbitrary one.
  const organizationId = await resolveOwnedProfileOrganizationId(
    session.user.id,
  );
  const organization = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: profileSelect,
      })
    : null;
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

    // RA-8516: an owner of several organisations saves to a deterministic
    // one (see resolveOwnedProfileOrganizationId), not whichever the
    // database returns first.
    const organizationId = await resolveOwnedProfileOrganizationId(
      session.user.id,
    );
    const org = organizationId
      ? await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true, email: true },
        })
      : null;
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
      if (field === "email" && trimmed === "") {
        patch[field] = null;
        continue;
      }
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
      // RA-8503: the business email is also the inbox told when a technician
      // submits a job visit, so it must be one real address (RA-8516: the
      // shared parseEmail check, also used at send time). Only a changed
      // value is checked, so an older stored value that was never validated
      // does not block saving the rest of the profile.
      if (
        field === "email" &&
        trimmed !== org.email?.trim() &&
        !parseEmail(trimmed)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Office email must be a valid email address",
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
