import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractReportFromUpload } from "@/lib/services/ai/extract-report-from-upload";
import { apiError } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

// Configuration constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const REQUEST_TIMEOUT = 180000; // 180 seconds (3 minutes) for large/complex PDFs
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

/**
 * Validate PDF file
 */
function validatePDF(
  buffer: Buffer,
  fileName: string,
): { valid: boolean; error?: string } {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB. Please upload a smaller file.`,
    };
  }

  // Check minimum size (PDFs should be at least a few bytes)
  if (buffer.length < 100) {
    return {
      valid: false,
      error: "File is too small to be a valid PDF. The file may be corrupted.",
    };
  }

  // Check PDF header (PDF files start with %PDF)
  const header = buffer.slice(0, 4).toString("ascii");
  if (header !== "%PDF") {
    // Some PDFs might have BOM or whitespace, check first 10 bytes
    const headerWithPadding = buffer.slice(0, 10).toString("ascii");
    if (!headerWithPadding.includes("%PDF")) {
      return {
        valid: false,
        error:
          "File does not appear to be a valid PDF. Please ensure the file is a PDF document.",
      };
    }
  }

  // Check for PDF footer (PDFs end with %%EOF)
  const footer = buffer.slice(-6).toString("ascii");
  if (
    !footer.includes("%%EOF") &&
    !footer.includes("%%EOF\n") &&
    !footer.includes("%%EOF\r")
  ) {
    // Some PDFs might have additional data after EOF, check last 100 bytes
    const footerWithPadding = buffer.slice(-100).toString("ascii");
    if (!footerWithPadding.includes("%%EOF")) {
      // This is a warning, not an error - some valid PDFs might not have EOF marker
      console.warn(
        `PDF ${fileName} may not have proper EOF marker, but continuing...`,
      );
    }
  }

  return { valid: true };
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY,
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors
      if (
        error.message?.includes("invalid_api_key") ||
        error.message?.includes("401") ||
        error.message?.includes("403") ||
        (error.message?.includes("file") &&
          error.message?.includes("too large")) ||
        (error.message?.includes("file") && error.message?.includes("format"))
      ) {
        throw error;
      }

      // Check if it's a connection error that should be retried
      const isConnectionError =
        error.message?.includes("connection") ||
        error.message?.includes("network") ||
        error.message?.includes("timeout") ||
        error.message?.includes("ECONNREFUSED") ||
        error.message?.includes("ENOTFOUND") ||
        error.message?.includes("ETIMEDOUT") ||
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND" ||
        error.code === "ETIMEDOUT";

      if (!isConnectionError && attempt < maxRetries - 1) {
        // For non-connection errors, still retry but log it
        console.warn(
          `Non-connection error on attempt ${attempt + 1}/${maxRetries}:`,
          error.message,
        );
      }

      if (attempt < maxRetries - 1) {
        await sleep(delay);
        delay = Math.min(delay * 2, MAX_RETRY_DELAY); // Exponential backoff with max cap
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

/**
 * Create timeout promise
 */
function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Request timeout after ${timeoutMs / 1000} seconds. The PDF may be too large or complex. Please try a smaller file or contact support.`,
        ),
      );
    }, timeoutMs);
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const userId = session.user.id;

    const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
    const sessionUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!sessionUser) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(
        sessionUser.subscriptionStatus ?? "",
      )
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Active subscription required",
        status: 402,
      });
    }

    // RA-6932 (P0) — resolve the workspace's own BYOK Anthropic key. Never
    // falls through to the platform ANTHROPIC_API_KEY; a keyless workspace
    // gets a hard 402 PAYMENT_REQUIRED.
    let anthropicApiKey: string;
    try {
      anthropicApiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC"))
        .apiKey;
    } catch (error) {
      if (error instanceof NoWorkspaceKeyError) {
        return apiError(request, {
          code: "PAYMENT_REQUIRED",
          message: error.message,
          status: 402,
        });
      }
      throw error;
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No file provided",
        status: 400,
      });
    }

    // Validate file type
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        {
          error: "File must be a PDF",
          details: `Received file type: ${file.type || "unknown"}. Please upload a PDF document.`,
        },
        { status: 400 },
      );
    }

    // Read and validate file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate PDF
    const validation = validatePDF(buffer, file.name);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.error || "Invalid PDF file",
          details:
            "Please ensure the file is a valid, uncorrupted PDF document.",
        },
        { status: 400 },
      );
    }

    const base64Data = buffer.toString("base64");
    const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);

    // Service-layer AI call (Wave-3 Task 10). Wrapped in
    // retryWithBackoff + a request-level timeout race so the original
    // pre-flight resilience semantics survive the migration. The
    // service itself owns the SDK shape (model, max_tokens, document
    // block, prompt cache, JSON parse) and the structured reason union.
    const result = await retryWithBackoff(async () => {
      return Promise.race([
        extractReportFromUpload({
          apiKey: anthropicApiKey,
          input: { base64Data },
        }),
        createTimeoutPromise(REQUEST_TIMEOUT),
      ]);
    });

    if (!result.ok) {
      console.error("[reports/upload]", {
        userId,
        reason: result.reason,
        detail: result.detail,
        fileName: file.name,
        fileSize: fileSizeMB + "MB",
      });

      if (result.reason === "RATE_LIMITED") {
        return NextResponse.json(
          {
            error: "API rate limit exceeded",
            details: "Too many requests. Please wait a moment and try again.",
            suggestion:
              "If this persists, consider upgrading your plan or reducing the frequency of uploads.",
          },
          {
            status: 429,
            headers: result.retryAfterMs
              ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
              : {},
          },
        );
      }

      if (result.reason === "MODEL_OVERLOADED") {
        return NextResponse.json(
          {
            error: "Model temporarily overloaded",
            details: "The analysis service is overloaded. Please try again shortly.",
            retryable: true,
          },
          {
            status: 503,
            headers: result.retryAfterMs
              ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
              : {},
          },
        );
      }

      if (result.reason === "KEY_MISSING") {
        // Unreachable in practice — a keyless workspace already returns 402
        // from the resolveWorkspaceAiKey block above — but mapped for
        // completeness.
        return NextResponse.json(
          {
            error: "Failed to get Anthropic API key",
            details:
              "Please connect an Anthropic API key in the Integrations page or ensure ANTHROPIC_API_KEY is set in environment variables.",
          },
          { status: 400 },
        );
      }

      if (result.reason === "PARSE_FAILED") {
        return NextResponse.json(
          {
            error: "Failed to parse extracted data from PDF.",
            suggestion:
              "If this persists, the PDF format may be too complex. Try a simpler report or contact support.",
          },
          { status: 502 },
        );
      }

      // API_ERROR — generic 500 with the safe legacy suggestion text.
      return NextResponse.json(
        {
          error: "Failed to analyze PDF",
          suggestion:
            "Please ensure the PDF is a valid water damage restoration report. If the problem persists, try: (1) Re-saving the PDF, (2) Converting to a different PDF format, (3) Contacting support with the error details.",
          fileName: file.name,
          fileSize: fileSizeMB + "MB",
        },
        { status: 500 },
      );
    }

    const parsedData = result.data.parsedData as Record<string, any>;

    // Extract and format all fields
    const extractedData: any = {
      // Basic Information
      clientName: parsedData.clientName || "",
      clientContactDetails: parsedData.clientContactDetails || "",
      propertyAddress: parsedData.propertyAddress || "",
      propertyPostcode: parsedData.propertyPostcode || "",
      claimReferenceNumber: parsedData.claimReferenceNumber || "",
      incidentDate: parsedData.incidentDate || "",
      technicianAttendanceDate: parsedData.technicianAttendanceDate || "",
      technicianName: parsedData.technicianName || "",
      technicianFieldReport:
        parsedData.technicianFieldReport || parsedData.fullText || "",

      // Property Intelligence
      buildingAge: parsedData.buildingAge
        ? String(parsedData.buildingAge)
        : "",
      structureType: parsedData.structureType || "",
      accessNotes: parsedData.accessNotes || "",

      // Hazard Profile
      insurerName: parsedData.insurerName || "",
      methamphetamineScreen: parsedData.methamphetamineScreen || "NEGATIVE",
      methamphetamineTestCount: parsedData.methamphetamineTestCount
        ? String(parsedData.methamphetamineTestCount)
        : "",
      biologicalMouldDetected:
        parsedData.biologicalMouldDetected === true ||
        parsedData.biologicalMouldDetected === "true",
      biologicalMouldCategory: parsedData.biologicalMouldCategory || "",

      // Additional Contact Information - Builder/Developer
      builderDeveloperCompanyName:
        parsedData.builderDeveloperCompanyName || "",
      builderDeveloperContact: parsedData.builderDeveloperContact || "",
      builderDeveloperAddress: parsedData.builderDeveloperAddress || "",
      builderDeveloperPhone: parsedData.builderDeveloperPhone || "",

      // Additional Contact Information - Owner/Management
      ownerManagementContactName: parsedData.ownerManagementContactName || "",
      ownerManagementPhone: parsedData.ownerManagementPhone || "",
      ownerManagementEmail: parsedData.ownerManagementEmail || "",

      // Previous Maintenance & Repair History
      lastInspectionDate: parsedData.lastInspectionDate || "",
      buildingChangedSinceLastInspection:
        parsedData.buildingChangedSinceLastInspection || "",
      structureChangesSinceLastInspection:
        parsedData.structureChangesSinceLastInspection || "",
      previousLeakage: parsedData.previousLeakage || "",
      emergencyRepairPerformed: parsedData.emergencyRepairPerformed || "",

      // Timeline Estimation
      phase1StartDate: parsedData.phase1StartDate || "",
      phase1EndDate: parsedData.phase1EndDate || "",
      phase2StartDate: parsedData.phase2StartDate || "",
      phase2EndDate: parsedData.phase2EndDate || "",
      phase3StartDate: parsedData.phase3StartDate || "",
      phase3EndDate: parsedData.phase3EndDate || "",

      // Equipment & Tools Selection - Psychrometric Assessment
      psychrometricWaterClass:
        parsedData.psychrometricWaterClass || parsedData.waterClass || 2,
      psychrometricTemperature: parsedData.psychrometricTemperature || null,
      psychrometricHumidity: parsedData.psychrometricHumidity || null,
      psychrometricSystemType: parsedData.psychrometricSystemType || "closed",

      // Equipment & Tools Selection - Scope Areas
      scopeAreas: parsedData.scopeAreas || [],

      // Equipment & Tools Selection - Equipment Deployment
      equipmentDeployment: Array.isArray(parsedData.equipmentDeployment)
        ? parsedData.equipmentDeployment.map((eq: any) => ({
            equipmentName: eq.equipmentName || eq.name || "",
            quantity:
              typeof eq.quantity === "number"
                ? eq.quantity
                : parseInt(eq.quantity) || 0,
            dailyRate:
              typeof eq.dailyRate === "number"
                ? eq.dailyRate
                : parseFloat(eq.dailyRate) || 0,
            duration:
              typeof eq.duration === "number"
                ? eq.duration
                : parseInt(eq.duration) || 0,
            totalCost:
              typeof eq.totalCost === "number"
                ? eq.totalCost
                : parseFloat(eq.totalCost) || 0,
          }))
        : [],
      equipmentMentioned: parsedData.equipmentMentioned || [],
      estimatedDryingDuration:
        parsedData.estimatedDryingDuration ||
        (parsedData.equipmentDeployment &&
        Array.isArray(parsedData.equipmentDeployment) &&
        parsedData.equipmentDeployment.length > 0
          ? Math.max(
              ...parsedData.equipmentDeployment.map(
                (eq: any) => eq.duration || 0,
              ),
            )
          : null),
      totalEquipmentCost:
        parsedData.totalEquipmentCost ||
        (parsedData.equipmentDeployment &&
        Array.isArray(parsedData.equipmentDeployment) &&
        parsedData.equipmentDeployment.length > 0
          ? parsedData.equipmentDeployment.reduce(
              (sum: number, eq: any) =>
                sum +
                (typeof eq.totalCost === "number"
                  ? eq.totalCost
                  : parseFloat(eq.totalCost) || 0),
              0,
            )
          : null),

      // NIR Inspection Data
      nirData: {
        moistureReadings: Array.isArray(parsedData.moistureReadings)
          ? parsedData.moistureReadings.map((r: any) => ({
              location: r.location || "",
              surfaceType: r.surfaceType || "Drywall",
              moistureLevel:
                typeof r.moistureLevel === "number"
                  ? r.moistureLevel
                  : parseFloat(r.moistureLevel) || 0,
              depth: r.depth === "Subsurface" ? "Subsurface" : "Surface",
            }))
          : [],
        // RA-7001: the extraction prompt now asks the model for m²
        // (affectedAreaSqm) directly — AU/NZ reports state area in metres,
        // so no AI-driven unit conversion is needed. InitialDataEntryForm
        // already prefers this field (falling back to converting a legacy
        // affectedSquareFootage value) so no further mapping is required.
        affectedAreas: Array.isArray(parsedData.affectedAreas)
          ? parsedData.affectedAreas.map((a: any) => ({
              roomZoneId: a.roomZoneId || "",
              affectedAreaSqm:
                typeof a.affectedAreaSqm === "number"
                  ? a.affectedAreaSqm
                  : parseFloat(a.affectedAreaSqm) || 0,
              waterSource: a.waterSource || "Clean Water",
              timeSinceLoss:
                typeof a.timeSinceLoss === "number"
                  ? a.timeSinceLoss
                  : parseFloat(a.timeSinceLoss) || 0,
            }))
          : [],
        scopeItems: Array.isArray(parsedData.scopeItems)
          ? parsedData.scopeItems
          : [],
      },
    };

    return NextResponse.json({
      success: true,
      extractedText: parsedData.fullText || "",
      parsedData: extractedData,
      message:
        "PDF parsed successfully. All available data extracted. Please review and complete the form.",
    });
  } catch (error: any) {
    // RA-786: do not leak error.message to clients
    console.error("Unexpected error in PDF upload handler:", error);

    return NextResponse.json(
      {
        error: "Failed to process PDF upload",
        suggestion:
          "If this problem persists, please contact support with details about the file you're trying to upload.",
      },
      { status: 500 },
    );
  }
}
