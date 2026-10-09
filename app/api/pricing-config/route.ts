import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveEffectivePricing } from "@/lib/pricing/effective-pricing";
import { hasConfiguredAi } from "@/lib/services/integrations/ai-readiness";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { verifyTenantAdmin } from "@/lib/admin-auth";

// GET - Retrieve pricing configuration for current user
export async function GET(request: NextRequest) {
  try {
    // RA-paid-client tranche 1: pricing configuration is protected.
    // Re-validate the role from the database on every read — the JWT
    // `session.user.role` claim can be stale for up to 90 days after a
    // demotion, and a demoted technician must not continue to read
    // admin-only rates.
    const session = await getServerSession(authOptions);
    const auth = await verifyTenantAdmin(session);
    if (auth.response) return auth.response;
    const userId = auth.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    // Configuration presence, using the same canonical scope as AI readers.
    const hasApiKey = await hasConfiguredAi(user.id);

    // D-001: show the same organisation-first card used by the estimators.
    // Reading the legacy user row here can overwrite newer setup rates on save.
    const pricingConfig = await resolveEffectivePricing(prisma, user.id);

    // Parse custom fields if they exist
    let customFields = null;
    if (pricingConfig?.customFields) {
      try {
        customFields = JSON.parse(pricingConfig.customFields);
      } catch (e) {
        console.error("Error parsing custom fields:", e);
      }
    }

    // If no config exists, return default values
    if (!pricingConfig) {
      return NextResponse.json({
        pricingConfig: null,
        defaults: getDefaultPricingConfig(),
        canEdit: true,
        hasApiKey,
      });
    }

    return NextResponse.json({
      pricingConfig: {
        ...pricingConfig,
        customFields,
      },
      canEdit: true,
      hasApiKey,
    });
  } catch (error) {
    return fromException(request, error, { stage: "get" });
  }
}

// PUT - Create or update pricing configuration
export async function PUT(request: NextRequest) {
  try {
    // RA-paid-client tranche 1: re-validate the role from the database
    // on every write. See GET for rationale.
    const session = await getServerSession(authOptions);
    const auth = await verifyTenantAdmin(session);
    if (auth.response) return auth.response;
    const userId = auth.user!.id;

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

    // Lock pricing configuration for free users.
    // RA-7893: read the business owner's plan (an invited technician carries
    // status null and used to skip this lock), and fail closed: anything
    // other than an active paid plan (lifetime included) stays locked.
    const effectiveSub = await getEffectiveSubscription(user.id);
    if (effectiveSub?.subscriptionStatus !== "ACTIVE") {
      return apiError(request, {
        code: "FORBIDDEN",
        message:
          "Pricing configuration is locked for free users. Upgrade to unlock this feature.",
        status: 403,
      });
    }

    let data: any;
    try {
      const parsed = await request.json();
      data =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    // Validate required fields
    const requiredFields = [
      "masterQualifiedNormalHours",
      "masterQualifiedSaturday",
      "masterQualifiedSunday",
      "qualifiedTechnicianNormalHours",
      "qualifiedTechnicianSaturday",
      "qualifiedTechnicianSunday",
      "labourerNormalHours",
      "labourerSaturday",
      "labourerSunday",
      "airMoverAxialDailyRate",
      "airMoverCentrifugalDailyRate",
      "dehumidifierLGRDailyRate",
      "dehumidifierDesiccantDailyRate",
      "afdUnitLargeDailyRate",
      "extractionTruckMountedHourlyRate",
      "extractionElectricHourlyRate",
      "injectionDryingSystemDailyRate",
      "antimicrobialTreatmentRate",
      "mouldRemediationTreatmentRate",
      "biohazardTreatmentRate",
      "administrationFee",
      "callOutFee",
      "thermalCameraUseCostPerAssessment",
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Missing required field: ${field}`,
          status: 400,
        });
      }
      if (typeof data[field] !== "number" || data[field] < 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Invalid value for ${field}: must be a positive number`,
          status: 400,
        });
      }

      // NRPG hard boundary validation
      // RA-1548 — left raw: rich 400 with field/min/max siblings (the client
      // uses them to highlight the offending input and show the range).
      const range = NRPG_RATE_RANGES[field];
      if (range && (data[field] < range.min || data[field] > range.max)) {
        return NextResponse.json(
          {
            error: `${range.label} rate $${data[field].toFixed(2)} is outside the typical industry range ($${range.min} – $${range.max})`,
            field,
            min: range.min,
            max: range.max,
          },
          { status: 400 },
        );
      }
    }

    // Handle custom fields - validate and stringify
    let customFieldsJson = null;
    if (data.customFields) {
      // Validate custom fields structure
      const validCategories = ["labour", "equipment", "chemical", "fees"];
      const customFieldsObj = data.customFields;

      for (const category of Object.keys(customFieldsObj)) {
        if (!validCategories.includes(category)) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Invalid category: ${category}. Must be one of: ${validCategories.join(", ")}`,
            status: 400,
          });
        }

        if (!Array.isArray(customFieldsObj[category])) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Custom fields for ${category} must be an array`,
            status: 400,
          });
        }

        for (const field of customFieldsObj[category]) {
          if (!field.name || typeof field.name !== "string") {
            return apiError(request, {
              code: "VALIDATION",
              message: `Each custom field must have a valid name`,
              status: 400,
            });
          }
          if (typeof field.value !== "number" || field.value < 0) {
            return apiError(request, {
              code: "VALIDATION",
              message: `Custom field "${field.name}" must have a valid positive number value`,
              status: 400,
            });
          }
        }
      }

      customFieldsJson = JSON.stringify(customFieldsObj);
    }

    // Upsert pricing configuration
    // RA-7026: one field set for BOTH writes so the two stores can never drift.
    const rateData = {
      masterQualifiedNormalHours: data.masterQualifiedNormalHours,
      masterQualifiedSaturday: data.masterQualifiedSaturday,
      masterQualifiedSunday: data.masterQualifiedSunday,
      qualifiedTechnicianNormalHours: data.qualifiedTechnicianNormalHours,
      qualifiedTechnicianSaturday: data.qualifiedTechnicianSaturday,
      qualifiedTechnicianSunday: data.qualifiedTechnicianSunday,
      labourerNormalHours: data.labourerNormalHours,
      labourerSaturday: data.labourerSaturday,
      labourerSunday: data.labourerSunday,
      airMoverAxialDailyRate: data.airMoverAxialDailyRate,
      airMoverCentrifugalDailyRate: data.airMoverCentrifugalDailyRate,
      dehumidifierLGRDailyRate: data.dehumidifierLGRDailyRate,
      dehumidifierDesiccantDailyRate: data.dehumidifierDesiccantDailyRate,
      afdUnitLargeDailyRate: data.afdUnitLargeDailyRate,
      extractionTruckMountedHourlyRate: data.extractionTruckMountedHourlyRate,
      extractionElectricHourlyRate: data.extractionElectricHourlyRate,
      injectionDryingSystemDailyRate: data.injectionDryingSystemDailyRate,
      antimicrobialTreatmentRate: data.antimicrobialTreatmentRate,
      mouldRemediationTreatmentRate: data.mouldRemediationTreatmentRate,
      biohazardTreatmentRate: data.biohazardTreatmentRate,
      administrationFee: data.administrationFee,
      callOutFee: data.callOutFee,
      thermalCameraUseCostPerAssessment: data.thermalCameraUseCostPerAssessment,
      customFields: customFieldsJson,
    };

    const pricingConfig = await prisma.companyPricingConfig.upsert({
      where: { userId: user.id },
      update: rateData,
      create: { userId: user.id, ...rateData },
    });

    // RA-7026 write-side SSOT: mirror the edit to the authoritative org store so
    // it reaches Margot + the estimators (both read OrganizationPricingConfig
    // first). Without this a dashboard edit would be silently shadowed for org
    // users. The org table's required fields are exactly `rateData`'s keys.
    if (user.organizationId) {
      await prisma.organizationPricingConfig.upsert({
        where: { organizationId: user.organizationId },
        update: rateData,
        create: { organizationId: user.organizationId, ...rateData },
      });
    }

    // Parse custom fields for response
    let customFields = null;
    if (pricingConfig.customFields) {
      try {
        customFields = JSON.parse(pricingConfig.customFields);
      } catch (e) {
        console.error("Error parsing custom fields:", e);
      }
    }

    return NextResponse.json({
      pricingConfig: {
        ...pricingConfig,
        customFields,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "save" });
  }
}

// Helper function to return default pricing values
function getDefaultPricingConfig() {
  return {
    masterQualifiedNormalHours: 85.0,
    masterQualifiedSaturday: 127.5,
    masterQualifiedSunday: 170.0,
    qualifiedTechnicianNormalHours: 65.0,
    qualifiedTechnicianSaturday: 97.5,
    qualifiedTechnicianSunday: 130.0,
    labourerNormalHours: 45.0,
    labourerSaturday: 67.5,
    labourerSunday: 90.0,
    airMoverAxialDailyRate: 25.0,
    airMoverCentrifugalDailyRate: 35.0,
    dehumidifierLGRDailyRate: 45.0,
    dehumidifierDesiccantDailyRate: 65.0,
    afdUnitLargeDailyRate: 40.0,
    extractionTruckMountedHourlyRate: 120.0,
    extractionElectricHourlyRate: 80.0,
    injectionDryingSystemDailyRate: 150.0,
    antimicrobialTreatmentRate: 8.5,
    // RA-7001: floor of the NRPG $65-145/m² range (founder-approved 2026-07-06).
    // Set to the conservative low end, not the midpoint — flag for founder tuning.
    mouldRemediationTreatmentRate: 65.0,
    biohazardTreatmentRate: 25.0,
    administrationFee: 250.0,
    callOutFee: 150.0,
    thermalCameraUseCostPerAssessment: 75.0,
  };
}
