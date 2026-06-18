import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError } from "@/lib/api-errors";

/**
 * GET /api/authority-forms/sign/:token
 * Public endpoint — looks up signing token, returns form data + signatory info
 * No auth required (token-based access)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Rate limit: 20 requests per 15 minutes per IP
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 20,
      prefix: "form-sign",
    });
    if (rateLimited) return rateLimited;

    const { token } = await params;

    if (!token) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Token is required",
        status: 400,
      });
    }

    const signature = await prisma.authorityFormSignature.findUnique({
      where: { signatureRequestToken: token },
      include: {
        instance: {
          include: {
            template: { select: { name: true, code: true } },
            signatures: {
              select: {
                id: true,
                signatoryName: true,
                signatoryRole: true,
                signedAt: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!signature) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invalid or expired signing link",
        status: 404,
      });
    }

    if (signature.signedAt) {
      return NextResponse.json(
        {
          error: "already_signed",
          message: "This form has already been signed",
        },
        { status: 400 },
      );
    }

    const form = signature.instance;

    return NextResponse.json({
      signatory: {
        id: signature.id,
        name: signature.signatoryName,
        role: signature.signatoryRole,
        email: signature.signatoryEmail,
      },
      form: {
        id: form.id,
        templateName: form.template.name,
        templateCode: form.template.code,
        companyName: form.companyName,
        companyLogo: form.companyLogo,
        companyPhone: form.companyPhone,
        companyEmail: form.companyEmail,
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        incidentBrief: form.incidentBrief,
        incidentDate: form.incidentDate,
        authorityDescription: form.authorityDescription,
        status: form.status,
        signatures: form.signatures,
      },
    });
  } catch (error: any) {
    console.error("[Sign Token GET] Error:", error);
    return apiError(request, {
      code: "INTERNAL",
      message: "Failed to load signing page",
      status: 500,
      err: error,
      stage: "sign-get",
    });
  }
}

/**
 * POST /api/authority-forms/sign/:token
 * Public endpoint — submit a signature via token
 * Saves signature data, IP, user agent, marks signedAt
 * Auto-updates form status if all signatures complete
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Rate limit: 10 submissions per 15 minutes per IP
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "form-sign-submit",
    });
    if (rateLimited) return rateLimited;

    const { token } = await params;
    const body = await request.json();
    const { signatureData, signatoryName } = body;

    if (!token) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Token is required",
        status: 400,
      });
    }

    if (!signatureData) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Signature data is required",
        status: 400,
      });
    }
    // I1: guard against arbitrarily large canvas payloads (base64 PNG/SVG).
    // 500 kB covers the largest realistic signature drawing with room to spare.
    if (typeof signatureData !== "string" || signatureData.length > 500_000) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Signature data exceeds maximum allowed size",
        status: 400,
      });
    }

    // Look up the signature record to get the id and instanceId
    const signature = await prisma.authorityFormSignature.findUnique({
      where: { signatureRequestToken: token },
    });

    if (!signature) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invalid or expired signing link",
        status: 404,
      });
    }

    // Capture verification data
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Atomic check-and-sign: updateMany with WHERE signedAt IS NULL prevents the
    // double-tap race where two simultaneous submissions both read signedAt=null,
    // both pass the guard, and both record the signature (firing completion emails twice).
    const result = await prisma.authorityFormSignature.updateMany({
      where: { id: signature.id, signedAt: null },
      data: {
        signatureData,
        signatoryName: signatoryName || signature.signatoryName,
        signedAt: new Date(),
        ipAddress,
        userAgent,
      },
    });

    if (result.count === 0) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This form has already been signed",
        status: 400,
      });
    }

    // Fetch the updated record for instanceId-based checks below
    const updated = await prisma.authorityFormSignature.findUnique({
      where: { id: signature.id },
    });
    if (!updated) {
      return apiError(request, {
        code: "INTERNAL",
        message: "Internal server error",
        status: 500,
      });
    }

    // Check if all signatures for this form are now complete
    const allSignatures = await prisma.authorityFormSignature.findMany({
      where: { instanceId: signature.instanceId },
    });

    const allSigned = allSignatures.every((sig) => sig.signedAt !== null);

    if (allSigned) {
      await prisma.authorityFormInstance.update({
        where: { id: signature.instanceId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    } else {
      // Update to PARTIALLY_SIGNED if not already
      const form = await prisma.authorityFormInstance.findUnique({
        where: { id: signature.instanceId },
        select: { status: true },
      });

      if (
        form &&
        form.status !== "PARTIALLY_SIGNED" &&
        form.status !== "COMPLETED"
      ) {
        await prisma.authorityFormInstance.update({
          where: { id: signature.instanceId },
          data: { status: "PARTIALLY_SIGNED" },
        });
      }
    }

    // I3: revoke the single-use signing token so a replayed GET cannot
    // leak PII (signatory name, email, client address) indefinitely.
    await prisma.authorityFormSignature.update({
      where: { id: signature.id },
      data: { signatureRequestToken: null },
    });

    return NextResponse.json({
      success: true,
      allSigned,
      formId: signature.instanceId,
    });
  } catch (error: any) {
    console.error("[Sign Token POST] Error:", error);
    return apiError(request, {
      code: "INTERNAL",
      message: "Failed to submit signature",
      status: 500,
      err: error,
      stage: "sign-post",
    });
  }
}
