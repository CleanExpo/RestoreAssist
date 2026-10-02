import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveStateInfo } from "@/lib/state-detection";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { getGstTreatment } from "@/lib/gst-rules";
import { buildCostEstimationData } from "@/lib/restoration/cost-estimation-builder";

// POST - Generate Cost Estimation document
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

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "gen-cost",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  // RA-1266: AI cost-estimation generation — retry doubles AI spend and
  // may create duplicate cost documents.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          organization: {
            select: { country: true },
          },
          pricingConfig: {
            select: {
              id: true,
              administrationFee: true,
              antimicrobialTreatmentRate: true,
              biohazardTreatmentRate: true,
              callOutFee: true,
              extractionTruckMountedHourlyRate: true,
              injectionDryingSystemDailyRate: true,
              labourerNormalHours: true,
              masterQualifiedNormalHours: true,
              masterQualifiedSaturday: true,
              mouldRemediationTreatmentRate: true,
              qualifiedTechnicianNormalHours: true,
              qualifiedTechnicianSaturday: true,
              thermalCameraUseCostPerAssessment: true,
            },
          },
        },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      const country = user.organization?.country;
      if (country !== "AU" && country !== "NZ") {
        return apiError(request, {
          code: "VALIDATION",
          message: "Complete your organisation country before calculating tax.",
          status: 422,
        });
      }
      const gstTreatment = getGstTreatment(country);

      // Subscription gate — CANCELED/PAST_DUE users must not run AI generation
      const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
      if (
        !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
      ) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Active subscription required",
          status: 402,
        });
      }

      let parsed: { reportId?: string } = {};
      try {
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { reportId } = parsed;

      if (!reportId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Report ID is required",
          status: 400,
        });
      }

      // Get the complete report with all data
      const report = await prisma.report.findUnique({
        where: { id: reportId, userId: user.id },
        // RA-7006: pull the captured power assessment so the safety
        // reconciliation uses the real site supply, not the 2×20A assumption.
        include: {
          inspection: {
            select: {
              propertyCountry: true,
              powerCircuits: true,
              powerCircuitRatingA: true,
              powerDeratePct: true,
            },
          },
        },
      });

      if (!report) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      // Get scope of works data if available
      const scopeData = report.scopeOfWorksData
        ? JSON.parse(report.scopeOfWorksData)
        : null;

      // Parse all stored data
      const analysis = report.technicianReportAnalysis
        ? JSON.parse(report.technicianReportAnalysis)
        : null;
      const tier1 = report.tier1Responses
        ? JSON.parse(report.tier1Responses)
        : null;
      const tier2 = report.tier2Responses
        ? JSON.parse(report.tier2Responses)
        : null;
      const tier3 = report.tier3Responses
        ? JSON.parse(report.tier3Responses)
        : null;

      // Parse equipment selection data (from Equipment Tools Selection step)
      const equipmentSelection = report.equipmentSelection
        ? JSON.parse(report.equipmentSelection)
        : [];

      // Parse psychrometric assessment and scope areas
      const psychrometricAssessment = report.psychrometricAssessment
        ? JSON.parse(report.psychrometricAssessment)
        : null;
      const scopeAreas = report.scopeAreas ? JSON.parse(report.scopeAreas) : [];

      // Get pricing configuration
      const pricingConfig = user.pricingConfig;

      if (!pricingConfig) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Pricing configuration not found. Please configure your pricing in Settings.",
          status: 400,
        });
      }

      const stateInfo = resolveStateInfo({
        postcode: report.propertyPostcode,
        country: report.inspection?.propertyCountry,
      });

      // RA-6932 — this route computes the cost estimation deterministically and
      // makes NO AI call, so it resolves no API key. The prior platform-key
      // affordance (whose result was only `void`ed) delegated to a helper that
      // falls back to the platform ANTHROPIC_API_KEY; removed to close that
      // platform-spend leak. Re-add via resolveWorkspaceAiKey if AI narrative
      // enhancement is ever introduced.

      // Build cost estimation data structure
      const costData = buildCostEstimationData({
        report,
        analysis,
        tier1,
        tier2,
        tier3,
        pricingConfig,
        stateInfo,
        scopeData,
        equipmentSelection,
        psychrometricAssessment,
        scopeAreas,
        gstTreatment,
      });

      // Generate the document - build it server-side with exact values, use AI only for narrative enhancement
      const costDocument = buildCostEstimationDocument(costData);

      // Save the generated document and data. totalCost was previously never
      // written by any generator (RA-7003) — the dashboard revenue tile and
      // the IICRC PDF "Estimated Total Cost" line stayed empty.
      await prisma.report.update({
        where: { id: reportId },
        data: {
          costEstimationDocument: costDocument,
          costEstimationData: JSON.stringify(costData),
          totalCost: costData.totals.totalIncGST,
        },
      });

      const updatedReport = await prisma.report.findUnique({
        where: { id: reportId },
      });

      return NextResponse.json({
        report: updatedReport,
        costEstimation: {
          document: costDocument,
          data: costData,
        },
        // RA-7006 Gap 1: expose the safety reconciliation to callers so an
        // unsafe/unbuildable priced configuration is visible, not hidden.
        safety: costData.safety,
        message: "Cost Estimation generated successfully",
      });
    } catch (error) {
      return fromException(request, error, { stage: "generate-cost-estimation" });
    }
  });
}

function buildCostEstimationDocument(costData: any): string {
  // Format categories as complete tables with exact values
  const formatCategories = (categories: any) => {
    let output = "";
    Object.values(categories).forEach((cat: any) => {
      output += `\n## ${cat.name}\n\n`;

      // Determine table structure based on category type
      const hasDays = cat.lineItems.some((item: any) => item.days);
      const hasSqm = cat.lineItems.some((item: any) => item.sqm);

      if (hasDays) {
        output += `| Description | Qty | Days | Daily Rate | Subtotal |\n`;
        output += `|-------------|-----|------|------------|----------|\n`;
        cat.lineItems.forEach((item: any) => {
          const qty = item.qty || 1;
          const days = item.days || 1;
          const rate = item.dailyRate || 0;
          const subtotal = item.subtotal || 0;
          output += `| ${item.description} | ${qty} | ${days} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`;
        });
      } else if (hasSqm) {
        output += `| Description | Sqm | Rate per Sqm | Subtotal |\n`;
        output += `|-------------|-----|--------------|----------|\n`;
        cat.lineItems.forEach((item: any) => {
          const sqm = item.sqm || 0;
          const rate = item.ratePerSqm || 0;
          const subtotal = item.subtotal || 0;
          output += `| ${item.description} | ${sqm} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`;
        });
      } else {
        // Default: Hours/Qty, Rate, Subtotal
        const hasHours = cat.lineItems.some((item: any) => item.hours);
        if (hasHours) {
          output += `| Description | Hours | Rate | Subtotal |\n`;
          cat.lineItems.forEach((item: any) => {
            const hours = item.hours || 0;
            const rate = item.rate || 0;
            const subtotal = item.subtotal || 0;
            output += `| ${item.description} | ${hours} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`;
          });
        } else {
          output += `| Description | Qty | Rate | Subtotal |\n`;
          cat.lineItems.forEach((item: any) => {
            const qty = item.qty || 1;
            const rate = item.rate || 0;
            const subtotal = item.subtotal || 0;
            output += `| ${item.description} | ${qty} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`;
          });
        }
      }

      output += `\n**Category Total: $${cat.total.toFixed(2)}**\n\n`;
    });
    return output;
  };

  // Format flagged items properly - remove duplicates
  const formatFlaggedItems = (items: any[]) => {
    if (!items || items.length === 0) {
      return "No items flagged for manual review.";
    }
    // Remove duplicates based on flag text
    const uniqueItems = items.filter(
      (item, index, self) =>
        index ===
        self.findIndex((t) => t.flag === item.flag && t.reason === item.reason),
    );
    return uniqueItems
      .map((item: any) => {
        return `[ra:warning] **${item.flag}**\n- **Reason:** ${item.reason}\n- **Action Required:** ${item.action}\n`;
      })
      .join("\n");
  };

  // Build complete document with exact values
  let document = `# PRELIMINARY COST ESTIMATION — NOT FINAL ESTIMATE

Based on: Inspection Report & Scope of Works ${costData.claimReference || "Reference"}
Date: ${costData.date}
Claim Reference: ${costData.claimReference}
Version: ${costData.version}

# SECTION 1: COST BREAKDOWN BY CATEGORY

${formatCategories(costData.categories)}

# SECTION 2: GRAND TOTAL AND COST SUMMARY

- Total Labour Costs (all categories): $${costData.totals.totalLabour.toFixed(2)}
- Total Equipment Rental Costs: $${costData.totals.totalEquipment.toFixed(2)}
- Total Chemical & Treatment Costs: $${costData.totals.totalChemicals.toFixed(2)}
- Total Administrative & Miscellaneous: $${costData.totals.totalAdmin.toFixed(2)}
- ———————————————————
- **SUBTOTAL (Restoration Works): $${costData.totals.subtotal.toFixed(2)}**
- GST (${costData.totals.gstPercentLabel}): $${costData.totals.gst.toFixed(2)}
- **TOTAL ESTIMATED COST (Restoration Services): $${costData.totals.totalIncGST.toFixed(2)}**

# SECTION 3: COST COMPARISON AND JUSTIFICATION

## Industry Average for Similar Claim
- ${costData.stateInfo?.name || "Comparable"} Water Damage, ${costData.affectedAreaSqm} sqm, ${costData.dryingDuration}-day drying
- Range: $${costData.industryComparison.average.min.toLocaleString()}–$${costData.industryComparison.average.max.toLocaleString()}
- Note: Based on IICRC S500 standard remediation; regional variation applies

## Your Estimated Cost
- Amount: $${costData.totals.subtotal.toFixed(2)}
- Analysis: ${costData.industryComparison.analysis}

## Cost Drivers (Key Line Items)
${
  costData.costDrivers.length > 0
    ? costData.costDrivers.map((d: string) => `- ${d}`).join("\n")
    : "- Standard water damage restoration protocol"
}

## Value Articulation Statement
This estimate reflects comprehensive water damage restoration per IICRC S500 standards, including 24/7 equipment operation, daily professional monitoring, thermal imaging to detect hidden moisture, and antimicrobial treatment to prevent secondary mould damage. The cost avoids far greater expenses: occupant relocation ($200–$400/night), contents replacement, and structural repairs if moisture damage extends ($50K+).

# SECTION 4: EXCLUSIONS AND NOT INCLUDED

NOT INCLUDED IN THIS ESTIMATE:
- Licensed Trades: Plumbing repair, electrical work, carpentry, mould specialist, asbestos abatement (separate specialist quotes required)
- Contents Restoration: Carpet cleaning/replacement, furniture restoration, appliance repair (if applicable)
- Building Repairs: Structural timber replacement, drywall/plasterboard replacement, painting, flooring re-installation
${costData.needsClass4 ? "- Class 4 Drying (if not explicitly listed): If yellow tongue sandwich drying extends beyond estimate, separate specialist quote required" : ""}
- Insurance Excess: Client responsibility per PDS
- Ongoing Maintenance Post-Restoration: Regular cleaning, preventative treatments beyond initial restoration scope

# SECTION 5: CONDITIONS AND ASSUMPTIONS

THIS ESTIMATE ASSUMES:
- Water source successfully stopped (plumbing repair assumed completed before drying begins)
- Property electrically safe for equipment operation (electrician clearance assumed completed)
- Access to all affected areas unrestricted
- No hazardous materials discovered (if discovered, separate specialist quote required)
- Standard weather conditions (no extreme heat/cold affecting drying timeline)
- Equipment availability at time of loss
- Drying completion within ${costData.dryingDuration} days

# SECTION 6: COST ADJUSTMENT TRIGGERS

TRIGGERS THAT WILL INCREASE COSTS:
${costData.hasHazards ? "- Hazard Discovery (Asbestos, Lead Paint, Mould): Can add $5K–$20K+ depending on extent" : ""}
- Extended Drying Timeline (>${costData.dryingDuration} days): Each additional day adds ~$800–$1,500
${costData.needsClass4 ? "- Class 4 Drying Confirmed: Typically adds $3K–$8K+" : ""}
${costData.flaggedItems.some((f: any) => f.flag && f.flag.includes("Mould")) ? "- Active Mould Growth: Can add $5K–$15K+ depending on spread" : ""}
- Weekend/After-Hours Deployment (Emergency): Can add 20–50% to labour
- Multiple Floors/Significant Water Migration: Add 30–50% to estimate

# SECTION 7: CLIENT EDIT AND CUSTOMISATION FIELDS

Note: All line items, quantities, rates, and calculations can be edited by the admin before finalising. System maintains calculation formulas but allows manual override.

# SECTION 8: FLAGGED ITEMS REQUIRING MANUAL REVIEW

${formatFlaggedItems(costData.flaggedItems || [])}
`;

  // RA-7006 Gap 1: surface the RA-7005 safety reconciliation so an unsafe or
  // unbuildable priced configuration is never hidden. Critical advisories
  // (e.g. air movers priced over active mould) lead the section.
  const safety = costData.safety;
  if (safety && safety.advisories?.length) {
    const ordered = [...safety.advisories].sort((a: any, b: any) =>
      a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
    );
    document += `\n# SECTION 9: EQUIPMENT SAFETY RECONCILIATION (RA-7005)\n\n`;
    document += ordered
      .map(
        (a: any) =>
          `${a.severity === "critical" ? "[ra:critical] CRITICAL" : "[ra:warning] WARNING"}: ${a.text}`,
      )
      .join("\n\n");
    document += `\n`;
  }

  return document;
}
