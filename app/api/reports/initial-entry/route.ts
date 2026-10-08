import { matchClientForReport } from "@/lib/clients/match-client-for-report";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  completeIdempotentSuccessInTransaction,
  getIdempotencyKey,
  withIdempotency,
} from "@/lib/idempotency";
import { isRecentlyIssuedCreationKey } from "@/lib/creation-attempt-key";
import { apiError, fromException } from "@/lib/api-errors";
import { recordFirstReportSaved } from "@/lib/analytics/first-report-saved";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import type { Prisma } from "@prisma/client";
import { isEffectivePlanCurrent } from "@/lib/billing/subscription-gate";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { resolveEffectivePricing } from "@/lib/pricing/effective-pricing";
import { getEquipmentGroupById, getEquipmentPricingField } from "@/lib/equipment-matrix";

class InspectionLinkConflictError extends Error {}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
class IdempotencyReservationLostError extends Error {}

// Read only the caller's own reserved result. This lets a remounted form
// recover a committed report without storing customer details in the browser.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }
  const keyResult = getIdempotencyKey(request);
  if (!keyResult.ok || !keyResult.key) {
    return apiError(request, { code: "VALIDATION", message: "Valid report Idempotency-Key required", status: 400 });
  }
  try {
    const userId = session.user.id;
    const record = await prisma.idempotencyRecord.findUnique({
      where: { cacheKey: `idem:${userId}:${keyResult.key}` },
      select: { scope: true, key: true, status: true, responseStatus: true, responseBody: true, expiresAt: true },
    });
    if (!record || record.scope !== userId || record.key !== keyResult.key || record.expiresAt <= new Date()) {
      const retryable = (!record || (record.scope === userId && record.key === keyResult.key &&
        record.status === "PENDING" && record.expiresAt <= new Date())) &&
        isRecentlyIssuedCreationKey(keyResult.key, "report-initial");
      return NextResponse.json({ state: retryable
        ? "retryable_missing" : "missing" });
    }
    if (record.status !== "COMPLETE") return NextResponse.json({ state: "pending" });
    if (record.responseStatus !== 200 || !record.responseBody) {
      return NextResponse.json({ state: "rejected" });
    }
    let reportId: unknown;
    try {
      const cached = JSON.parse(record.responseBody);
      reportId = cached?.initialEntry === true ? cached?.report?.id : null;
    } catch {
      return NextResponse.json({ state: "unconfirmed" });
    }
    if (typeof reportId !== "string" || !reportId) {
      return NextResponse.json({ state: "unconfirmed" });
    }
    const report = await prisma.report.findFirst({
      where: { id: reportId, userId }, select: { id: true },
    });
    if (!report) return NextResponse.json({ state: "unconfirmed" });
    const inspectionId = request.nextUrl.searchParams.get("inspectionId");
    if (inspectionId) {
      const link = await prisma.inspection.findFirst({
        where: { id: inspectionId, userId, reportId: report.id },
        select: { id: true },
      });
      if (!link) return NextResponse.json({ state: "unconfirmed" });
    }
    return NextResponse.json({ state: "complete", reportId: report.id });
  } catch (error) {
    return fromException(request, error, { stage: "initial-entry-recovery" });
  }
}

// POST - Create initial report entry (Phase 2 Step 2)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const keyResult = getIdempotencyKey(request);
  if (!keyResult.ok || !keyResult.key) {
    return apiError(request, {
      code: "VALIDATION", message: "Valid report Idempotency-Key required", status: 400,
    });
  }
  const creationKey = keyResult.key;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 5,
    prefix: "report-create",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  // RA-1266: report creation deducts credits — retry without idempotency
  // double-deducts and creates two reports.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      // RA-7893: an invited technician uses the business owner's plan.
      const effectiveSub = await getEffectiveSubscription(userId);
      if (!effectiveSub || !isEffectivePlanCurrent(effectiveSub)) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Active subscription required",
          status: 402,
        });
      }

      let data: any;
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      // Validate required fields
      if (!data.clientName || !data.clientName.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Client name is required",
          status: 400,
        });
      }

      if (!data.propertyAddress || !data.propertyAddress.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Property address is required",
          status: 400,
        });
      }

      if (!data.propertyPostcode || !data.propertyPostcode.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Property postcode is required",
          status: 400,
        });
      }

      // RA-7726: a report started from /dashboard/reports/new?inspectionId=
      // must link back to that inspection, or Generate Invoice refuses it with
      // "A linked report is required". Linking writes Inspection.reportId, so
      // it takes the same write scope as the prefill that loaded the form, and
      // is checked before any client row is written or credit is charged.
      // "Not yours" and "does not exist" are the same 404, so an id from
      // another tenant reveals nothing.
      let inspectionLinkWhere: Prisma.InspectionWhereInput | null = null;
      let inspectionLinkProperty: { propertyAddress: string; propertyPostcode: string } | null = null;
      if (data.inspectionId !== undefined && data.inspectionId !== null) {
        if (typeof data.inspectionId !== "string" || !data.inspectionId) {
          return apiError(request, {
            code: "VALIDATION",
            message: "inspectionId must be a non-empty string",
            status: 400,
          });
        }
        const write = await resolveInspectionWrite(session, data.inspectionId);
        if (!write.ok) {
          return apiError(request, {
            code: "NOT_FOUND",
            message: "Inspection not found",
            status: 404,
          });
        }
        inspectionLinkWhere = write.data.inspectionManyWhere;
        const linkTarget = await prisma.inspection.findFirst({
          where: { AND: [inspectionLinkWhere, { userId, reportId: null }] },
          select: { id: true, propertyAddress: true, propertyPostcode: true },
        });
        if (!linkTarget ||
            linkTarget.propertyAddress.trim().toLowerCase() !== data.propertyAddress.trim().toLowerCase() ||
            linkTarget.propertyPostcode.trim() !== data.propertyPostcode.trim()) {
          return apiError(request, {
            code: "CONFLICT",
            message: "Inspection is no longer available for this report and property",
            status: 409,
          });
        }
        inspectionLinkProperty = {
          propertyAddress: linkTarget.propertyAddress,
          propertyPostcode: linkTarget.propertyPostcode,
        };
      }

      // Generate report title/number
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-6);
      const reportTitle = `WD-${year}-${timestamp}`;

      // Helper to sanitize string values (empty strings -> null)
      const sanitizeString = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        const str = String(value).trim();
        return str === "" ? null : str;
      };

      // Helper to sanitize integer values
      const sanitizeInt = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === "string" && value.trim() === "") return null;
        const parsed = parseInt(String(value), 10);
        return isNaN(parsed) ? null : parsed;
      };

      // Parse dates - handle empty strings and invalid dates
      const parseDate = (dateValue: any): Date | null => {
        if (!dateValue) return null;
        if (typeof dateValue === "string" && dateValue.trim() === "")
          return null;
        const parsed = new Date(dateValue);
        return isNaN(parsed.getTime()) ? null : parsed;
      };

      const incidentDate = parseDate(data.incidentDate);
      const technicianAttendanceDate = parseDate(data.technicianAttendanceDate);

      // Extract email and phone from clientContactDetails if provided
      let clientEmail = "";
      let clientPhone = "";
      if (data.clientContactDetails) {
        const contactDetails = data.clientContactDetails.trim();
        // Try to extract email (look for @ symbol)
        const emailMatch = contactDetails.match(
          /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        );
        if (emailMatch) {
          clientEmail = emailMatch[1];
        }
        // Try to extract phone (look for phone patterns)
        const phoneMatch = contactDetails.match(
          /(\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/,
        );
        if (phoneMatch) {
          clientPhone = phoneMatch[0].trim();
        }
      }

      let clientLinkWarning: string | null = null;

      // Prepare NIR data if provided
      let nirDataJson = null;
      if (data.nirData) {
        const nirData = {
          moistureReadings: data.nirData.moistureReadings || [],
          affectedAreas: data.nirData.affectedAreas || [],
          scopeItems: data.nirData.scopeItems || [],
          photos: [], // Photos are only in Tier 3, not initial entry
        };
        nirDataJson = JSON.stringify(nirData);
      }

      // Prepare equipment data if provided
      let psychrometricAssessmentJson = null;
      let scopeAreasJson = null;
      let equipmentSelectionJson: string | null = null;
      let equipmentCostTotal: number | null = null;
      let estimatedDryingDuration: number | null = null;

      const equipmentData: unknown = data.equipmentData ?? null;
      if (equipmentData !== null && !isPlainObject(equipmentData)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "equipmentData must be an object",
          status: 400,
        });
      }

      if (equipmentData) {
        if (equipmentData.psychrometricAssessment) {
          psychrometricAssessmentJson = JSON.stringify(
            equipmentData.psychrometricAssessment,
          );
        }
        if (equipmentData.scopeAreas) {
          scopeAreasJson = JSON.stringify(equipmentData.scopeAreas);
        }

        // Equipment money is priced here from the organisation's own rate
        // card. USER/MANAGER cannot read that card (GET /api/pricing-config is
        // ADMIN-only), so any rate or total the browser sends is discarded.
        // No selection means no estimate: nothing is priced or stored.
        const selection = equipmentData.equipmentSelection ?? null;
        if (selection !== null && !Array.isArray(selection)) {
          return apiError(request, {
            code: "VALIDATION",
            message: "equipmentSelection must be an array",
            status: 400,
          });
        }
        if (selection && selection.length > 0) {
          const items: Array<{ groupId: string; quantity: number }> = [];
          for (const entry of selection) {
            if (!isPlainObject(entry) || typeof entry.groupId !== "string" ||
                !getEquipmentGroupById(entry.groupId)) {
              return apiError(request, {
                code: "VALIDATION",
                message: "Each equipment selection needs a known equipment group",
                status: 400,
              });
            }
            if (!isPositiveSafeInteger(entry.quantity)) {
              return apiError(request, {
                code: "VALIDATION",
                message: "Equipment quantity must be a positive whole number",
                status: 400,
              });
            }
            items.push({ groupId: entry.groupId, quantity: entry.quantity });
          }

          // estimatedDryingDuration is an Int column (days); absent means one day,
          // the same default the report builder applies.
          const rawDuration = equipmentData.estimatedDryingDuration ?? null;
          if (rawDuration !== null && !isPositiveSafeInteger(rawDuration)) {
            return apiError(request, {
              code: "VALIDATION",
              message: "Estimated drying duration must be a positive whole number of days",
              status: 400,
            });
          }
          const durationDays = rawDuration ?? 1;

          // Organisation card first; the DB-derived plan owner's legacy card
          // only when the organisation has no card at all.
          const pricing = await resolveEffectivePricing(prisma, userId, {
            legacyUserId: effectiveSub.id,
          });
          if (!pricing) {
            return apiError(request, {
              code: "VALIDATION",
              message: "Equipment pricing is not configured. An administrator must set daily equipment rates in Pricing settings before an equipment estimate can be saved.",
              status: 422,
              fields: { equipmentSelection: "No pricing configuration for this organisation" },
            });
          }

          const priced: Array<{ groupId: string; quantity: number; dailyRate: number; totalCost: number }> = [];
          let total = 0;
          for (const item of items) {
            const field = getEquipmentPricingField(item.groupId) as string;
            const dailyRate = (pricing as unknown as Record<string, unknown>)[field];
            if (typeof dailyRate !== "number" || !Number.isFinite(dailyRate) || dailyRate < 0) {
              return apiError(request, {
                code: "VALIDATION",
                message: "A selected equipment type has no usable daily rate. An administrator must set it in Pricing settings before this estimate can be saved.",
                status: 422,
                fields: { [field]: "Missing or invalid daily rate" },
              });
            }
            const totalCost = dailyRate * item.quantity * durationDays;
            total += totalCost;
            if (!Number.isFinite(totalCost) || !Number.isFinite(total)) {
              return apiError(request, {
                code: "VALIDATION",
                message: "Equipment estimate is too large to calculate",
                status: 422,
                fields: { equipmentSelection: "Estimate exceeds the calculable range" },
              });
            }
            priced.push({ ...item, dailyRate, totalCost });
          }

          equipmentSelectionJson = JSON.stringify(priced);
          equipmentCostTotal = total;
          estimatedDryingDuration = durationDays;
        }
      }

      // Prepare report data
      const reportData: any = {
        title: reportTitle,
        description: "Initial data entry - awaiting report generation",
        status: "DRAFT",
        clientName: data.clientName.trim(),
        clientId: null, // Resolved with the client write in the report transaction.
        propertyAddress: data.propertyAddress.trim(),
        hazardType: "Water", // Default for water damage restoration
        insuranceType: "", // Insurance cover has not been recorded at intake.
        userId: user.id,

        // Phase 2: Initial Data Entry Fields
        clientContactDetails: sanitizeString(data.clientContactDetails),
        propertyPostcode: data.propertyPostcode.trim(), // Required field, so no null check
        claimReferenceNumber: sanitizeString(data.claimReferenceNumber),
        incidentDate: incidentDate,
        technicianAttendanceDate: technicianAttendanceDate,
        technicianName: sanitizeString(data.technicianName),
        technicianFieldReport: sanitizeString(data.technicianFieldReport),

        // New Fields: Property ID and Job Number
        propertyId: sanitizeString(data.propertyId),
        jobNumber: sanitizeString(data.jobNumber),

        // Cover Page: Instructions/Standards References
        reportInstructions: sanitizeString(data.reportInstructions),

        // Additional Contact Information: Builder/Developer
        builderDeveloperCompanyName: sanitizeString(
          data.builderDeveloperCompanyName,
        ),
        builderDeveloperContact: sanitizeString(data.builderDeveloperContact),
        builderDeveloperAddress: sanitizeString(data.builderDeveloperAddress),
        builderDeveloperPhone: sanitizeString(data.builderDeveloperPhone),

        // Additional Contact Information: Owner/Management
        ownerManagementContactName: sanitizeString(
          data.ownerManagementContactName,
        ),
        ownerManagementPhone: sanitizeString(data.ownerManagementPhone),
        ownerManagementEmail: sanitizeString(data.ownerManagementEmail),

        // Previous Maintenance & Repair History
        lastInspectionDate: parseDate(data.lastInspectionDate),
        buildingChangedSinceLastInspection: sanitizeString(
          data.buildingChangedSinceLastInspection,
        ),
        structureChangesSinceLastInspection: sanitizeString(
          data.structureChangesSinceLastInspection,
        ),
        previousLeakage: sanitizeString(data.previousLeakage),
        emergencyRepairPerformed: sanitizeString(data.emergencyRepairPerformed),

        // Property Intelligence (Assessment Report Data Architecture)
        buildingAge: sanitizeInt(data.buildingAge),
        structureType: sanitizeString(data.structureType),
        accessNotes: sanitizeString(data.accessNotes),

        // Hazard Profile (Assessment Report Data Architecture)
        insurerName: sanitizeString(data.insurerName),
        methamphetamineScreen: sanitizeString(data.methamphetamineScreen),
        methamphetamineTestCount: sanitizeInt(data.methamphetamineTestCount),
        biologicalMouldDetected:
          data.biologicalMouldDetected === true ||
          data.biologicalMouldDetected === "true" ||
          data.biologicalMouldDetected === 1,
        biologicalMouldCategory: sanitizeString(data.biologicalMouldCategory),

        // Timeline Estimation Data (Assessment Report Data Architecture)
        phase1StartDate: parseDate(data.phase1StartDate),
        phase1EndDate: parseDate(data.phase1EndDate),
        phase2StartDate: parseDate(data.phase2StartDate),
        phase2EndDate: parseDate(data.phase2EndDate),
        phase3StartDate: parseDate(data.phase3StartDate),
        phase3EndDate: parseDate(data.phase3EndDate),

        // NIR Data (if provided)
        moistureReadings: nirDataJson,

        // Equipment Data (if provided)
        psychrometricAssessment: psychrometricAssessmentJson,
        scopeAreas: scopeAreasJson,
        equipmentSelection: equipmentSelectionJson,
        equipmentCostTotal,
        estimatedDryingDuration,
        // Update related fields if equipment data provided
        waterClass:
          data.equipmentData?.psychrometricAssessment?.waterClass?.toString() ||
          null,
        targetTemperature:
          data.equipmentData?.psychrometricAssessment?.temperature || null,
        targetHumidity:
          data.equipmentData?.psychrometricAssessment?.humidity || null,
        affectedArea: data.equipmentData?.metrics?.totalAffectedArea || null,
        dehumidificationCapacity:
          data.equipmentData?.metrics?.waterRemovalTarget || null,
        airmoversCount: data.equipmentData?.metrics?.airMoversRequired || null,

        // Report Generation Stage
        reportDepthLevel: null, // Will be set when user chooses Basic/Enhanced
        reportVersion: 1,

        // Set report number
        reportNumber: reportTitle,
        inspectionDate: technicianAttendanceDate,
      };

      // Conditionally add team assignment fields if they exist in the schema
      // These fields were added for the team management feature
      if (data.assignedManagerId) {
        reportData.assignedManagerId = data.assignedManagerId;
      }
      if (data.assignedAdminId) {
        reportData.assignedAdminId = data.assignedAdminId;
      }

      // Check entitlement before beginning the atomic charge and create.
      const { canCreateReport, deductCreditsAndTrackUsage } =
        await import("@/lib/report-limits");
      const canCreate = await canCreateReport(user.id);

      if (!canCreate.allowed) {
        return NextResponse.json(
          {
            error: canCreate.reason || "Cannot create report",
            upgradeRequired: true,
          },
          { status: 402 },
        );
      }

      // Charge, update/create the client, create the report, and link its job
      // in one transaction. A refusal or failed insert leaves none of them.
      let report;
      let successPayload;
      try {
        const result = await prisma.$transaction(async (tx) => {
          await deductCreditsAndTrackUsage(user.id, tx);
          const match = await matchClientForReport(tx, user.id, {
            name: data.clientName,
            email: clientEmail || null,
            phone: clientPhone || null,
            address: data.propertyAddress,
          });
          const linkedClientId = match.clientId;
          if (match.warning) clientLinkWarning = match.warning;
          const created = await tx.report.create({
            data: { ...reportData, clientId: linkedClientId },
          });
          if (inspectionLinkWhere) {
            const linked = await tx.inspection.updateMany({
              where: { AND: [
                inspectionLinkWhere,
                { userId, reportId: null, ...inspectionLinkProperty },
              ] },
              data: { reportId: created.id },
            });
            if (linked.count !== 1) throw new InspectionLinkConflictError();
          }
          const payload = {
            initialEntry: true,
            report: { id: created.id },
            clientLinkWarning,
            inspectionLinked: Boolean(inspectionLinkWhere),
            message: "Initial data saved successfully. Proceed to report generation.",
          };
          const completed = await completeIdempotentSuccessInTransaction({
            tx, scope: userId, key: creationKey, method: "POST",
            path: request.nextUrl.pathname, rawBody,
            responseBody: JSON.stringify(payload),
          });
          if (!completed) throw new IdempotencyReservationLostError();
          return { report: created, payload };
        });
        report = result.report;
        successPayload = result.payload;
      } catch (createError) {
        if (createError instanceof Error && createError.message === "INSUFFICIENT_CREDITS") {
          return NextResponse.json(
            {
              error: "No credits remaining. Please subscribe to continue.",
              upgradeRequired: true,
            },
            { status: 402 },
          );
        }
        if (createError instanceof InspectionLinkConflictError) {
          return apiError(request, {
            code: "CONFLICT",
            message: "Inspection was linked to another report; reload before saving",
            status: 409,
          });
        }
        if (createError instanceof IdempotencyReservationLostError) {
          const response = apiError(request, {
            code: "CONFLICT",
            message: "Report creation could not be verified; check its status before retrying",
            status: 409,
          });
          // Another request may have completed this key while this transaction
          // rolled back. The outer middleware must not overwrite that result.
          response.headers.set("X-RestoreAssist-Idempotency-Uncertain", "true");
          return response;
        }
        throw createError;
      }

      // RA-7622 — first_report_saved (first-time only, AFTER persist)
      try {
        await recordFirstReportSaved(userId, { reportId: report.id });
      } catch {
        // The report and charge have committed. A nonessential analytics
        // failure must not tell the caller to retry report creation.
        console.error("[initial-entry] first-report analytics failed");
      }

      // After saving, trigger intelligent standards analysis in background
      // This prepares standards context for when user generates the report.
      // RA-1325: gate behind ACTIVE/LIFETIME — TRIAL accounts can create 30
      // reports and each fires an Anthropic call, enabling cost amplification
      // via signup spam. TRIAL users still get standards at report-generation
      // time (on demand) so feature parity is maintained.
      const isUpgradedAccount = ["ACTIVE", "LIFETIME"].includes(
        effectiveSub?.subscriptionStatus ?? "",
      );
      if (isUpgradedAccount) try {
        const { retrieveRelevantStandards } =
          await import("@/lib/standards-retrieval");

        // RA-6932 (P0) — resolve the workspace's own BYOK Anthropic key.
        // Never falls through to the platform ANTHROPIC_API_KEY. This is a
        // best-effort background pre-fetch: if the workspace has no key,
        // resolveWorkspaceAiKey throws and the surrounding catch simply skips
        // the pre-fetch (standards are still fetched on-demand at generation).
        const { resolveWorkspaceAiKey } =
          await import("@/lib/ai/resolve-workspace-ai-key");
        const anthropicApiKey = (
          await resolveWorkspaceAiKey(user.id, "ANTHROPIC")
        ).apiKey;

        // Build intelligent query from submitted data
        const retrievalQuery = {
          reportType: "water" as const, // Default for water damage
          waterCategory: report.waterCategory?.replace("Category ", "") as
            | "1"
            | "2"
            | "3"
            | undefined,
          materials: report.structureType ? [report.structureType] : [],
          affectedAreas: [],
          keywords: [
            report.waterCategory || "",
            report.waterClass || "",
            report.biologicalMouldDetected ? "mould" : "",
            report.methamphetamineScreen === "POSITIVE"
              ? "methamphetamine"
              : "",
          ].filter(Boolean) as string[],
          technicianNotes: report.technicianFieldReport || "",
        };

        // Pre-fetch standards in background (don't await - let it run async)
        retrieveRelevantStandards(retrievalQuery, anthropicApiKey)
          .then((standards) => {})
          .catch((error) => {
            console.error(
              `[Initial Entry] Error pre-fetching standards:`,
              error,
            );
          });
      } catch (error) {
        // Non-critical - just log the error
        console.error(
          `[Initial Entry] Error setting up standards pre-fetch:`,
          error,
        );
      }

      return NextResponse.json(successPayload);
    } catch (error) {
      return fromException(request, error, { stage: "initial-entry" });
    }
  }, { successCompletedInHandler: true });
}
