/**
 * Form Submission API
 * POST /api/forms/submit
 * Submit interview-populated form data
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";

/**
 * Generate submission number (e.g., "WO-2026-001")
 */
function generateSubmissionNumber(): string {
  const year = new Date().getFullYear();
  const prefix = "WO";

  // Get the latest submission number for this year
  // For now, use timestamp-based approach
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${year}-${timestamp}`;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 15,
    prefix: "forms-submit",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: form submissions can generate work-orders / invoices
  // downstream — a double-submit cascades into duplicate billing.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const {
        templateId,
        formData,
        reportId,
        saveDraft = true,
        metadata,
      } = body;

      if (!templateId) {
        return NextResponse.json(
          { error: "Template ID is required" },
          { status: 400 },
        );
      }

      if (!formData) {
        return NextResponse.json(
          { error: "Form data is required" },
          { status: 400 },
        );
      }

      // Verify template exists
      const template = await prisma.formTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        return NextResponse.json(
          { error: "Form template not found" },
          { status: 404 },
        );
      }

      // Verify report exists if reportId provided
      if (reportId) {
        const report = await prisma.report.findUnique({
          where: { id: reportId },
        });

        if (!report) {
          return NextResponse.json(
            { error: "Report not found" },
            { status: 404 },
          );
        }
      }

      // Generate submission number
      const submissionNumber = generateSubmissionNumber();

      // Create form submission
      const submission = await prisma.formSubmission.create({
        data: {
          templateId,
          userId: user.id,
          reportId: reportId || null,
          submissionNumber,
          status: saveDraft ? "DRAFT" : "IN_PROGRESS",
          formData: JSON.stringify(formData),
          startedAt: new Date(),
          lastSavedAt: new Date(),
          ...(metadata &&
            {
              // Store metadata in formData or create a separate metadata field if needed
              // For now, we'll merge it into formData
            }),
        },
      });

      // If metadata contains interview information, we could store it separately
      // For now, we'll include it in the response

      return NextResponse.json({
        success: true,
        submissionId: submission.id,
        submissionNumber: submission.submissionNumber,
        status: submission.status,
        metadata: metadata || {},
      });
    } catch (error) {
      // RA-786: do not leak error.message to clients
      console.error("Error submitting form:", error);
      return NextResponse.json(
        { success: false, error: "Failed to submit form" },
        { status: 500 },
      );
    }
  });
}
