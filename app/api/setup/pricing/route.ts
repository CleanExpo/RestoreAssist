import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

// Whitelist of fields the wizard is allowed to patch on OrganizationPricingConfig.
// Names match the actual Prisma schema field names (snake_case converted to camelCase).
const PATCHABLE_PRICING_FIELDS = [
  // Labour rates
  "masterQualifiedNormalHours",
  "masterQualifiedSaturday",
  "masterQualifiedSunday",
  "qualifiedTechnicianNormalHours",
  "qualifiedTechnicianSaturday",
  "qualifiedTechnicianSunday",
  "labourerNormalHours",
  "labourerSaturday",
  "labourerSunday",
  // Equipment daily rental
  "airMoverAxialDailyRate",
  "airMoverCentrifugalDailyRate",
  "dehumidifierLGRDailyRate",
  "dehumidifierDesiccantDailyRate",
  "afdUnitLargeDailyRate",
  "extractionTruckMountedHourlyRate",
  "extractionElectricHourlyRate",
  "injectionDryingSystemDailyRate",
  // Optional equipment (nullable in schema)
  "negativeAirMachineDailyRate",
  "hepaVacuumDailyRate",
  "monitoringVisitDailyRate",
  "mobilisationFee",
  "wasteDisposalPerBinRate",
  "photoDocumentationFee",
  // Chemical treatment
  "antimicrobialTreatmentRate",
  "mouldRemediationTreatmentRate",
  "biohazardTreatmentRate",
  // Fees
  "administrationFee",
  "callOutFee",
  "thermalCameraUseCostPerAssessment",
  // Multipliers and percentages (have @default in schema)
  "afterHoursMultiplier",
  "saturdayMultiplier",
  "sundayMultiplier",
  "publicHolidayMultiplier",
  "projectManagementPercent",
] as const;

// Required fields (non-nullable, no @default) not in a typical wizard PATCH.
// These get zero defaults in the upsert create branch.
const REQUIRED_DEFAULTS: Record<string, number> = {
  masterQualifiedNormalHours: 0,
  masterQualifiedSaturday: 0,
  masterQualifiedSunday: 0,
  qualifiedTechnicianNormalHours: 0,
  qualifiedTechnicianSaturday: 0,
  qualifiedTechnicianSunday: 0,
  labourerNormalHours: 0,
  labourerSaturday: 0,
  labourerSunday: 0,
  airMoverAxialDailyRate: 0,
  airMoverCentrifugalDailyRate: 0,
  dehumidifierLGRDailyRate: 0,
  dehumidifierDesiccantDailyRate: 0,
  afdUnitLargeDailyRate: 0,
  extractionTruckMountedHourlyRate: 0,
  extractionElectricHourlyRate: 0,
  injectionDryingSystemDailyRate: 0,
  antimicrobialTreatmentRate: 0,
  mouldRemediationTreatmentRate: 0,
  biohazardTreatmentRate: 0,
  administrationFee: 0,
  callOutFee: 0,
  thermalCameraUseCostPerAssessment: 0,
};

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(undefined, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError(undefined, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, setupCompletedAt: true },
  });
  if (!org) {
    return apiError(undefined, {
      code: "NOT_FOUND",
      message: "No organization for this user",
      status: 404,
    });
  }
  if (org.setupCompletedAt) {
    return apiError(undefined, {
      code: "CONFLICT",
      message: "Setup already complete; edit in Settings instead",
      status: 409,
    });
  }

  const patch: Record<string, number> = {};
  for (const field of PATCHABLE_PRICING_FIELDS) {
    if (field in body) {
      const v = body[field];
      const n =
        typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(n) && n >= 0) patch[field] = n;
    }
  }

  if (Object.keys(patch).length === 0) {
    return apiError(undefined, {
      code: "VALIDATION",
      message: "No patchable pricing fields in body",
      status: 400,
    });
  }

  // Merge required defaults with the patched values so the create branch always
  // satisfies the non-nullable schema constraints.
  const createData = { ...REQUIRED_DEFAULTS, ...patch };

  await prisma.organizationPricingConfig.upsert({
    where: { organizationId: org.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: { organizationId: org.id, ...createData } as any,
    update: patch,
  });

  return NextResponse.json({ data: { updated: Object.keys(patch) } });
}
