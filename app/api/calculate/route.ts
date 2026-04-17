import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRestorationInvoiceTypeById } from "@/lib/restoration-invoice-types";
import { applyRateLimit } from "@/lib/rate-limiter";
import { z } from "zod";

/** Minimum charge enforced on all quotes (ex-GST). */
const MINIMUM_CHARGE_EX_GST = 2750;

/** Australian GST rate. */
const GST_RATE = 0.1;

const QuoteRequestSchema = z.object({
  jobType: z.enum(["water", "fire", "mould", "storm", "bioclean"]),
  affectedAreaM2: z.number().min(1).max(10000),
  numberOfRooms: z.number().int().min(1).max(50),
  dryingDays: z.number().int().min(1).max(30),
  labourHours: z.number().min(0).max(500),
  labourTier: z
    .enum(["masterQualified", "qualifiedTechnician", "labourer"])
    .default("qualifiedTechnician"),
  labourPeriod: z
    .enum(["NormalHours", "Saturday", "Sunday"])
    .default("NormalHours"),
  airMoversAxial: z.number().int().min(0).max(50).default(0),
  airMoversCentrifugal: z.number().int().min(0).max(50).default(0),
  dehumidifiersLGR: z.number().int().min(0).max(20).default(0),
  dehumidifiersDesiccant: z.number().int().min(0).max(20).default(0),
  afdUnitsLarge: z.number().int().min(0).max(10).default(0),
  extractionTruckMountedHours: z.number().min(0).max(24).default(0),
  extractionElectricHours: z.number().min(0).max(24).default(0),
  injectionDryingDays: z.number().int().min(0).max(30).default(0),
  includeCallOut: z.boolean().default(true),
  includeAdminFee: z.boolean().default(true),
  includeThermalCamera: z.boolean().default(false),
  clientName: z.string().max(200).optional(),
  clientAddress: z.string().max(500).optional(),
  clientPhone: z.string().max(50).optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
  jobDescription: z.string().max(2000).optional(),
});

/** Default pricing config (mirrors getDefaultPricingConfig in pricing-config route). */
function getDefaultRates() {
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
    mouldRemediationTreatmentRate: 15.0,
    biohazardTreatmentRate: 25.0,
    administrationFee: 250.0,
    callOutFee: 150.0,
    thermalCameraUseCostPerAssessment: 75.0,
  };
}

/** Maps job type to the chemical treatment rate field on CompanyPricingConfig. */
const JOB_TYPE_CHEMICAL_FIELD: Record<string, string> = {
  water: "antimicrobialTreatmentRate",
  fire: "antimicrobialTreatmentRate",
  storm: "antimicrobialTreatmentRate",
  mould: "mouldRemediationTreatmentRate",
  bioclean: "biohazardTreatmentRate",
};

const JOB_TYPE_CHEMICAL_LABEL: Record<string, string> = {
  water: "Antimicrobial Treatment",
  fire: "Antimicrobial Treatment (post-suppression)",
  storm: "Antimicrobial Treatment",
  mould: "Mould Remediation Treatment",
  bioclean: "Biohazard Decontamination Treatment",
};

interface QuoteLineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  subtotal: number;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      prefix: "calculate",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    // Subscription gate — CANCELED/PAST_DUE users must not run billable calculations
    const subUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true },
    });
    const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(subUser?.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        {
          error: "Active subscription required to calculate quotes",
          upgradeRequired: true,
        },
        { status: 402 },
      );
    }

    const body = await request.json();
    const parsed = QuoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Fetch contractor's pricing config (or use defaults)
    const config = await prisma.companyPricingConfig.findUnique({
      where: { userId: session.user.id },
    });
    const rates: Record<string, number> = config
      ? {
          masterQualifiedNormalHours: config.masterQualifiedNormalHours,
          masterQualifiedSaturday: config.masterQualifiedSaturday,
          masterQualifiedSunday: config.masterQualifiedSunday,
          qualifiedTechnicianNormalHours: config.qualifiedTechnicianNormalHours,
          qualifiedTechnicianSaturday: config.qualifiedTechnicianSaturday,
          qualifiedTechnicianSunday: config.qualifiedTechnicianSunday,
          labourerNormalHours: config.labourerNormalHours,
          labourerSaturday: config.labourerSaturday,
          labourerSunday: config.labourerSunday,
          airMoverAxialDailyRate: config.airMoverAxialDailyRate,
          airMoverCentrifugalDailyRate: config.airMoverCentrifugalDailyRate,
          dehumidifierLGRDailyRate: config.dehumidifierLGRDailyRate,
          dehumidifierDesiccantDailyRate: config.dehumidifierDesiccantDailyRate,
          afdUnitLargeDailyRate: config.afdUnitLargeDailyRate,
          extractionTruckMountedHourlyRate:
            config.extractionTruckMountedHourlyRate,
          extractionElectricHourlyRate: config.extractionElectricHourlyRate,
          injectionDryingSystemDailyRate: config.injectionDryingSystemDailyRate,
          antimicrobialTreatmentRate: config.antimicrobialTreatmentRate,
          mouldRemediationTreatmentRate: config.mouldRemediationTreatmentRate,
          biohazardTreatmentRate: config.biohazardTreatmentRate,
          administrationFee: config.administrationFee,
          callOutFee: config.callOutFee,
          thermalCameraUseCostPerAssessment:
            config.thermalCameraUseCostPerAssessment,
        }
      : getDefaultRates();

    // Fetch contractor business info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        businessName: true,
        businessABN: true,
        businessAddress: true,
        businessPhone: true,
        businessEmail: true,
        businessLogo: true,
      },
    });

    // Look up restoration invoice type for standards/labels
    const invoiceType = getRestorationInvoiceTypeById(input.jobType);

    // Build line items
    const lineItems: QuoteLineItem[] = [];

    // Call-out fee
    if (input.includeCallOut) {
      lineItems.push({
        description:
          "Call-Out Fee — Emergency response and initial site attendance",
        qty: 1,
        unit: "EA",
        rate: rates.callOutFee,
        subtotal: rates.callOutFee,
      });
    }

    // Labour
    if (input.labourHours > 0) {
      const labourRateKey = `${input.labourTier}${input.labourPeriod}`;
      const labourRate =
        rates[labourRateKey] ?? rates.qualifiedTechnicianNormalHours;
      const tierLabels: Record<string, string> = {
        masterQualified: "Master Qualified Technician",
        qualifiedTechnician: "Qualified Technician",
        labourer: "Labourer",
      };
      const periodLabels: Record<string, string> = {
        NormalHours: "Normal Hours",
        Saturday: "Saturday",
        Sunday: "Sunday",
      };
      lineItems.push({
        description: `Labour — ${tierLabels[input.labourTier]} (${periodLabels[input.labourPeriod]})`,
        qty: input.labourHours,
        unit: "hr",
        rate: labourRate,
        subtotal: Math.round(input.labourHours * labourRate * 100) / 100,
      });
    }

    // Equipment — Air Movers (Axial)
    if (input.airMoversAxial > 0) {
      const totalUnitDays = input.airMoversAxial * input.dryingDays;
      lineItems.push({
        description: `Air Movers (Axial) — ${input.airMoversAxial} units x ${input.dryingDays} days`,
        qty: totalUnitDays,
        unit: "unit-day",
        rate: rates.airMoverAxialDailyRate,
        subtotal:
          Math.round(totalUnitDays * rates.airMoverAxialDailyRate * 100) / 100,
      });
    }

    // Equipment — Air Movers (Centrifugal)
    if (input.airMoversCentrifugal > 0) {
      const totalUnitDays = input.airMoversCentrifugal * input.dryingDays;
      lineItems.push({
        description: `Air Movers (Centrifugal) — ${input.airMoversCentrifugal} units x ${input.dryingDays} days`,
        qty: totalUnitDays,
        unit: "unit-day",
        rate: rates.airMoverCentrifugalDailyRate,
        subtotal:
          Math.round(totalUnitDays * rates.airMoverCentrifugalDailyRate * 100) /
          100,
      });
    }

    // Equipment — Dehumidifiers (LGR)
    if (input.dehumidifiersLGR > 0) {
      const totalUnitDays = input.dehumidifiersLGR * input.dryingDays;
      lineItems.push({
        description: `Dehumidifiers (LGR) — ${input.dehumidifiersLGR} units x ${input.dryingDays} days`,
        qty: totalUnitDays,
        unit: "unit-day",
        rate: rates.dehumidifierLGRDailyRate,
        subtotal:
          Math.round(totalUnitDays * rates.dehumidifierLGRDailyRate * 100) /
          100,
      });
    }

    // Equipment — Dehumidifiers (Desiccant)
    if (input.dehumidifiersDesiccant > 0) {
      const totalUnitDays = input.dehumidifiersDesiccant * input.dryingDays;
      lineItems.push({
        description: `Dehumidifiers (Desiccant) — ${input.dehumidifiersDesiccant} units x ${input.dryingDays} days`,
        qty: totalUnitDays,
        unit: "unit-day",
        rate: rates.dehumidifierDesiccantDailyRate,
        subtotal:
          Math.round(
            totalUnitDays * rates.dehumidifierDesiccantDailyRate * 100,
          ) / 100,
      });
    }

    // Equipment — AFD Units (Large)
    if (input.afdUnitsLarge > 0) {
      const totalUnitDays = input.afdUnitsLarge * input.dryingDays;
      lineItems.push({
        description: `Air Filtration Devices (Large) — ${input.afdUnitsLarge} units x ${input.dryingDays} days`,
        qty: totalUnitDays,
        unit: "unit-day",
        rate: rates.afdUnitLargeDailyRate,
        subtotal:
          Math.round(totalUnitDays * rates.afdUnitLargeDailyRate * 100) / 100,
      });
    }

    // Extraction — Truck-Mounted
    if (input.extractionTruckMountedHours > 0) {
      lineItems.push({
        description: "Water Extraction — Truck-Mounted Equipment",
        qty: input.extractionTruckMountedHours,
        unit: "hr",
        rate: rates.extractionTruckMountedHourlyRate,
        subtotal:
          Math.round(
            input.extractionTruckMountedHours *
              rates.extractionTruckMountedHourlyRate *
              100,
          ) / 100,
      });
    }

    // Extraction — Electric/Portable
    if (input.extractionElectricHours > 0) {
      lineItems.push({
        description: "Water Extraction — Electric/Portable Equipment",
        qty: input.extractionElectricHours,
        unit: "hr",
        rate: rates.extractionElectricHourlyRate,
        subtotal:
          Math.round(
            input.extractionElectricHours *
              rates.extractionElectricHourlyRate *
              100,
          ) / 100,
      });
    }

    // Injection Drying System
    if (input.injectionDryingDays > 0) {
      lineItems.push({
        description: `Injection Drying System — ${input.injectionDryingDays} days`,
        qty: input.injectionDryingDays,
        unit: "day",
        rate: rates.injectionDryingSystemDailyRate,
        subtotal:
          Math.round(
            input.injectionDryingDays *
              rates.injectionDryingSystemDailyRate *
              100,
          ) / 100,
      });
    }

    // Chemical treatment (job-type specific)
    const chemicalField = JOB_TYPE_CHEMICAL_FIELD[input.jobType];
    const chemicalLabel = JOB_TYPE_CHEMICAL_LABEL[input.jobType];
    if (chemicalField && input.affectedAreaM2 > 0) {
      const chemicalRate = rates[chemicalField];
      lineItems.push({
        description: `${chemicalLabel} — ${input.affectedAreaM2} m² affected area`,
        qty: input.affectedAreaM2,
        unit: "m²",
        rate: chemicalRate,
        subtotal: Math.round(input.affectedAreaM2 * chemicalRate * 100) / 100,
      });
    }

    // Thermal camera assessment
    if (input.includeThermalCamera) {
      lineItems.push({
        description:
          "Thermal Camera Assessment — Infrared moisture detection and documentation",
        qty: 1,
        unit: "EA",
        rate: rates.thermalCameraUseCostPerAssessment,
        subtotal: rates.thermalCameraUseCostPerAssessment,
      });
    }

    // Administration fee
    if (input.includeAdminFee) {
      lineItems.push({
        description:
          "Administration Fee — Documentation, reporting, and project coordination",
        qty: 1,
        unit: "EA",
        rate: rates.administrationFee,
        subtotal: rates.administrationFee,
      });
    }

    // Calculate totals
    let subtotalExGST = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    subtotalExGST = Math.round(subtotalExGST * 100) / 100;

    const minimumApplied = subtotalExGST < MINIMUM_CHARGE_EX_GST;
    if (minimumApplied) {
      subtotalExGST = MINIMUM_CHARGE_EX_GST;
    }

    const gst = Math.round(subtotalExGST * GST_RATE * 100) / 100;
    const totalIncGST = Math.round((subtotalExGST + gst) * 100) / 100;

    // Generate quote number
    const shortId = session.user.id.slice(-4).toUpperCase();
    const quoteNumber = `QTE-${shortId}-${Date.now()}`;

    return NextResponse.json({
      quoteNumber,
      quoteDate: new Date().toISOString(),
      jobType: invoiceType?.label ?? input.jobType,
      standardApplied: invoiceType?.standardApplied ?? "",
      applicableStandards: invoiceType?.applicableStandards ?? [],
      contractor: {
        businessName: user?.businessName ?? "",
        abn: user?.businessABN ?? "",
        address: user?.businessAddress ?? "",
        phone: user?.businessPhone ?? "",
        email: user?.businessEmail ?? "",
        logo: user?.businessLogo ?? "",
      },
      client: {
        name: input.clientName ?? "",
        address: input.clientAddress ?? "",
        phone: input.clientPhone ?? "",
        email: input.clientEmail ?? "",
      },
      lineItems,
      subtotalExGST,
      gst,
      totalIncGST,
      minimumApplied,
      minimumChargeAmount: MINIMUM_CHARGE_EX_GST,
      jobDescription: input.jobDescription ?? "",
    });
  } catch (error) {
    console.error("Quote calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate quote" },
      { status: 500 },
    );
  }
}
