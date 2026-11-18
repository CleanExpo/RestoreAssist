import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEffectivePricing } from "@/lib/pricing/effective-pricing";
import { getRestorationInvoiceTypeById } from "@/lib/restoration-invoice-types";
import { reconcilePricingSafety } from "@/lib/restoration/reconcile-pricing-safety";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";
import {
  QuoteRequestSchema,
  applyMinimumCharge,
  quoteGstAsInvoiced,
  quoteLinePricesAsInvoiced,
  wholeCentRate,
} from "@/lib/quotes/quote-calc";
import { lineTotal } from "@/lib/estimate-lines";
import {
  blockedPricing,
  priceListReader,
  type BlockedLineFields,
} from "@/lib/pricing/blocked-line";
import { blockedPricingResponse } from "@/lib/pricing/blocked-line-response";
import { isEffectivePlanCurrent } from "@/lib/billing/subscription-gate";
import { getEffectiveSubscription } from "@/lib/organization-credits";

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
    // RA-7001: floor of the NRPG $65-145/m² range (founder-approved 2026-07-06).
    // Set to the conservative low end, not the midpoint — flag for founder tuning.
    mouldRemediationTreatmentRate: 65.0,
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

/** RA-8281 (B2): a quote line whose price-list rate is not set. */
interface BlockedQuoteLineItem extends BlockedLineFields {
  description: string;
  qty: number;
  unit: string;
  rate: null;
  subtotal: null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      prefix: "calculate",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    // Subscription gate — CANCELED/PAST_DUE users must not run billable calculations.
    // RA-7893: an invited technician uses the business owner's plan.
    const effective = await getEffectiveSubscription(session.user.id);
    if (!effective || !isEffectivePlanCurrent(effective)) {
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

    // Fetch contractor's pricing config (org config is SSOT; or use defaults)
    // RA-7893: the quote is priced as the business that pays for it — the
    // legacy fallback is the plan owner's, not an invited member's own row.
    const config = await resolveEffectivePricing(prisma, session.user.id, {
      legacyUserId: effective.id,
    });
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
        organization: {
          select: { country: true },
        },
      },
    });

    // Look up restoration invoice type for standards/labels
    const invoiceType = getRestorationInvoiceTypeById(input.jobType);

    // Build line items.
    // RA-8281 (B2): with a price list, every line reads its own rate through
    // the shared reader. A rate the contractor has not set makes that line a
    // blocked line (no rate, no amount); it is never priced at $0, at a
    // default or at another field's rate. Only the lines on this quote can
    // block it: an unset rate the quote does not use is not reported.
    // Price on whole-cent rates: the invoice draft can only carry cents.
    const reader = priceListReader(config);
    const defaults: Record<string, number> = getDefaultRates();
    const builtLines: Array<QuoteLineItem | BlockedQuoteLineItem> = [];
    const addLine = (
      description: string,
      qty: number,
      unit: string,
      field: string,
    ) => {
      const rate = config
        ? reader.calc([field], (r) => wholeCentRate(r))
        : wholeCentRate(defaults[field]);
      if (rate === null) {
        builtLines.push({
          description,
          qty,
          unit,
          rate: null,
          subtotal: null,
          ...(reader.lineFields([field]) as BlockedLineFields),
        });
        return;
      }
      builtLines.push({
        description,
        qty,
        unit,
        rate,
        subtotal: lineTotal(qty, rate),
      });
    };

    if (input.includeCallOut) {
      addLine(
        "Call-Out Fee — Emergency response and initial site attendance",
        1,
        "EA",
        "callOutFee",
      );
    }

    if (input.labourHours > 0) {
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
      // The tier and period are validated enums, so this names one of the
      // nine labour fields. There is no fallback to another tier's rate.
      addLine(
        `Labour — ${tierLabels[input.labourTier]} (${periodLabels[input.labourPeriod]})`,
        input.labourHours,
        "hr",
        `${input.labourTier}${input.labourPeriod}`,
      );
    }

    const unitDayLines: Array<[string, number, string]> = [
      ["Air Movers (Axial)", input.airMoversAxial, "airMoverAxialDailyRate"],
      [
        "Air Movers (Centrifugal)",
        input.airMoversCentrifugal,
        "airMoverCentrifugalDailyRate",
      ],
      [
        "Dehumidifiers (LGR)",
        input.dehumidifiersLGR,
        "dehumidifierLGRDailyRate",
      ],
      [
        "Dehumidifiers (Desiccant)",
        input.dehumidifiersDesiccant,
        "dehumidifierDesiccantDailyRate",
      ],
      [
        "Air Filtration Devices (Large)",
        input.afdUnitsLarge,
        "afdUnitLargeDailyRate",
      ],
    ];
    for (const [label, units, field] of unitDayLines) {
      if (units > 0) {
        addLine(
          `${label} — ${units} units x ${input.dryingDays} days`,
          units * input.dryingDays,
          "unit-day",
          field,
        );
      }
    }

    if (input.extractionTruckMountedHours > 0) {
      addLine(
        "Water Extraction — Truck-Mounted Equipment",
        input.extractionTruckMountedHours,
        "hr",
        "extractionTruckMountedHourlyRate",
      );
    }

    if (input.extractionElectricHours > 0) {
      addLine(
        "Water Extraction — Electric/Portable Equipment",
        input.extractionElectricHours,
        "hr",
        "extractionElectricHourlyRate",
      );
    }

    if (input.injectionDryingDays > 0) {
      addLine(
        `Injection Drying System — ${input.injectionDryingDays} days`,
        input.injectionDryingDays,
        "day",
        "injectionDryingSystemDailyRate",
      );
    }

    // Chemical treatment (job-type specific)
    const chemicalField = JOB_TYPE_CHEMICAL_FIELD[input.jobType];
    const chemicalLabel = JOB_TYPE_CHEMICAL_LABEL[input.jobType];
    if (chemicalField && input.affectedAreaM2 > 0) {
      addLine(
        `${chemicalLabel} — ${input.affectedAreaM2} m² affected area`,
        input.affectedAreaM2,
        "m²",
        chemicalField,
      );
    }

    if (input.includeThermalCamera) {
      addLine(
        "Thermal Camera Assessment — Infrared moisture detection and documentation",
        1,
        "EA",
        "thermalCameraUseCostPerAssessment",
      );
    }

    if (input.includeAdminFee) {
      addLine(
        "Administration Fee — Documentation, reporting, and project coordination",
        1,
        "EA",
        "administrationFee",
      );
    }

    // RA-8281 (B2): one blocked line blocks the quote. Every line is shown;
    // no subtotal, minimum charge, GST or total is worked out.
    if (builtLines.some((line) => line.rate === null)) {
      return blockedPricingResponse(
        blockedPricing(
          builtLines.map((line) =>
            line.rate === null
              ? {
                  description: line.description,
                  quantity: line.qty,
                  unit: line.unit,
                  rate: null,
                  subtotal: null,
                  pricingStatus: line.pricingStatus,
                  rateField: line.rateField,
                  pricingNote: line.pricingNote,
                }
              : {
                  description: line.description,
                  quantity: line.qty,
                  unit: line.unit,
                  rate: line.rate,
                  subtotal: line.subtotal,
                  pricingStatus: "priced" as const,
                },
          ),
          reader.missing(),
        ),
      );
    }
    const lineItems = builtLines as QuoteLineItem[];

    // Calculate totals (min charge + GST via shared helpers)
    const lineSubtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const {
      subtotalExGST,
      minimumApplied,
      minimumChargeAmount,
    } = applyMinimumCharge(lineSubtotal);
    const country = user?.organization?.country;
    if (country !== "AU" && country !== "NZ") {
      return apiError(request, {
        code: "VALIDATION",
        message: "Complete your organisation country before calculating tax.",
        status: 422,
      });
    }
    const { gst, totalIncGST } = quoteGstAsInvoiced(
      { lineItems, subtotalExGST },
      country,
    );
    // RA-7896: every row shows its price ex GST and inc GST, per line.
    const linePrices = quoteLinePricesAsInvoiced(
      { lineItems, subtotalExGST },
      country,
    );

    // Reconcile the priced equipment against the RA-7005 safety plan.
    //
    // This route is the CUSTOMER-FACING quote, and until now it was the only
    // priced document with no safety reconciliation at all: it prices air
    // movers by unit-days and treats "mould" as a job type, so a quote could
    // carry mould remediation and Phase 1 air movers on the same page.
    // `reconcile-pricing-safety.ts` calls that "remediation negligence (S520)".
    //
    // Unlike the report routes this is a STANDALONE calculator — no inspection,
    // no Report row, no tier-1 answers — so there is nothing for
    // `deriveMouldActive` to read. The mould signal has to come from the quote
    // itself, which is why `mouldActive` is an input: a WATER job with mould
    // growth cannot otherwise be expressed, and that is the case most likely to
    // be mis-priced.
    const safety = reconcilePricingSafety({
      affectedAreaM2: input.affectedAreaM2,
      equipmentSelection: [
        { type: "air_mover_axial", quantity: input.airMoversAxial },
        { type: "air_mover_centrifugal", quantity: input.airMoversCentrifugal },
      ],
      mouldActive: input.jobType === "mould" || input.mouldActive,
      hazards: input.jobType === "bioclean" ? ["biohazard"] : [],
      // No site power assessment exists on a quote, so the planner's assumed
      // 2x20A budget applies and is reported as assumed.
    });

    // Generate quote number
    const shortId = session.user.id.slice(-4).toUpperCase();
    const quoteNumber = `QTE-${shortId}-${Date.now()}`;

    return NextResponse.json({
      quoteNumber,
      quoteDate: new Date().toISOString(),
      jobType: invoiceType?.label ?? input.jobType,
      standardApplied: invoiceType?.standardApplied ?? "",
      applicableStandards: invoiceType?.applicableStandards ?? [],
      safety,
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
      lineItems: lineItems.map((item, i) => ({
        ...item,
        ...linePrices.lines[i],
      })),
      minimumChargeLine: linePrices.minimumChargeLine,
      subtotalExGST,
      gst,
      totalIncGST,
      minimumApplied,
      minimumChargeAmount,
      jobDescription: input.jobDescription ?? "",
      pricingSource: config ? "company_pricing_config" : "default_rates",
      pricingNote:
        "Rates come from Company Pricing Config (Settings → Pricing), not Cost Libraries. Use Estimation Engine + Cost Libraries for library-backed estimates.",
    });
  } catch (error) {
    return fromException(request, error, { stage: "calculate" });
  }
}
