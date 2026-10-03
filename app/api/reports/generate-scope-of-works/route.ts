import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveStateInfo } from "@/lib/state-detection";
import { buildScopeOfWorksData } from "@/lib/restoration/scope-of-works-builder";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { hasActiveSubscription } from "@/lib/billing/subscription-gate";

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
    prefix: "gen-scope",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  // RA-1266: AI scope-of-works generation — retry doubles AI spend.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          pricingConfig: {
            // Fields accessed directly + fields used by getEquipmentDailyRate
            // (lib/equipment-matrix.ts) which does dynamic key lookup.
            select: {
              id: true,
              administrationFee: true,
              afdUnitLargeDailyRate: true,
              airMoverAxialDailyRate: true,
              antimicrobialTreatmentRate: true,
              biohazardTreatmentRate: true,
              callOutFee: true,
              dehumidifierLGRDailyRate: true,
              dehumidifierDesiccantDailyRate: true,
              extractionTruckMountedHourlyRate: true,
              injectionDryingSystemDailyRate: true,
              labourerNormalHours: true,
              masterQualifiedNormalHours: true,
              mouldRemediationTreatmentRate: true,
              qualifiedTechnicianNormalHours: true,
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

      // Subscription gate — CANCELED/PAST_DUE users must not run AI generation
      if (!(await hasActiveSubscription(userId))) {
        return NextResponse.json(
          {
            error: "Active subscription required to generate reports",
            upgradeRequired: true,
          },
          { status: 402 },
        );
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

      const report = await prisma.report.findUnique({
        where: { id: reportId, userId: user.id },
        // RA-7003 store convergence: NIR-captured ScopeItems (the inspection
        // store) previously never reached this document — a scope captured on
        // site was invisible to the client-facing scope of works.
        include: {
          inspection: {
            select: {
              scopeItems: {
                where: { isSelected: true },
                select: {
                  itemType: true,
                  description: true,
                  quantity: true,
                  unit: true,
                  justification: true,
                  clauseRef: true,
                },
                take: 200,
              },
              propertyCountry: true,
              // RA-7006: captured site power assessment for the safety
              // reconciliation (else it assumes 2×20A).
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

      // RA-6932 — this route builds the scope deterministically and makes NO
      // AI call, so it resolves no API key. The prior platform-key affordance
      // (whose result was only `void`ed) delegated to a helper that falls back
      // to the platform ANTHROPIC_API_KEY; removed to close that platform-spend
      // leak. Re-add via resolveWorkspaceAiKey if AI narrative enhancement is
      // ever introduced here.

      // Parse equipment selection data (from Equipment Tools Selection step)
      const equipmentSelection = report.equipmentSelection
        ? JSON.parse(report.equipmentSelection)
        : [];

      // Parse psychrometric assessment and scope areas
      const psychrometricAssessment = report.psychrometricAssessment
        ? JSON.parse(report.psychrometricAssessment)
        : null;
      const scopeAreas = report.scopeAreas ? JSON.parse(report.scopeAreas) : [];

      const scopeData = buildScopeOfWorksData({
        report,
        analysis,
        tier1,
        tier2,
        tier3,
        pricingConfig,
        stateInfo,
        equipmentSelection,
        psychrometricAssessment,
        scopeAreas,
      });

      // RA-7003 store convergence: fold the inspection's captured scope items
      // into both the data payload and the client document.
      const inspectionScopeItems = report.inspection?.scopeItems ?? [];
      if (inspectionScopeItems.length > 0) {
        (scopeData as Record<string, unknown>).inspectionScopeItems =
          inspectionScopeItems;
      }

      let scopeDocument = buildScopeOfWorksDocument(scopeData);
      if (inspectionScopeItems.length > 0) {
        scopeDocument += [
          "\n\n# CAPTURED INSPECTION SCOPE ITEMS",
          "",
          "Items recorded on site during the inspection (in addition to the priced restoration works above):",
          "",
          ...inspectionScopeItems.map(
            (item) =>
              `- ${item.description}${item.quantity ? ` — ${item.quantity} ${item.unit ?? ""}`.trimEnd() : ""}${item.clauseRef ? ` (${item.clauseRef})` : ""}${item.justification ? `\n  Justification: ${item.justification}` : ""}`,
          ),
        ].join("\n");
      }

      const updatedReport = await prisma.report.update({
        where: { id: reportId },
        data: {
          scopeOfWorksDocument: scopeDocument,
          scopeOfWorksData: JSON.stringify(scopeData),
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        report: {
          ...updatedReport,
          scopeOfWorksDocument: scopeDocument,
          scopeOfWorksData: scopeData,
        },
        scopeOfWorks: {
          document: scopeDocument,
          data: scopeData,
        },
        // RA-7006 Gap 1: expose the safety reconciliation to callers.
        safety: scopeData.safety,
        message: "Scope of Works generated successfully",
      });
    } catch (error) {
      return fromException(request, error, {
        stage: "generate-scope-of-works",
      });
    }
  });
}

function calculateRW3Subtotal(
  rates: any,
  airMovers: number,
  dehumidifiers: number,
  afd: number,
  days: number,
): number {
  const labour =
    4 * rates.masterQualifiedNormalHours +
    6 * rates.qualifiedTechnicianNormalHours;
  const equipment =
    airMovers * days * rates.airMoverAxialDailyRate +
    dehumidifiers * days * rates.dehumidifierLGRDailyRate +
    afd * days * rates.afdUnitLargeDailyRate;
  return labour + equipment;
}

// Build the complete scope of works document server-side with exact values
function buildScopeOfWorksDocument(scopeData: any): string {
  // Format line items with actual calculations
  const formatLineItems = (items: any[]) => {
    let output = "";
    items.forEach((item: any, index: number) => {
      output += `\n## ${item.id}: ${item.description}\n\n`;
      output += `- **Qty:** ${item.qty}\n`;
      output += `- **Unit:** ${item.unit}\n`;

      // Calculate effective rate - use direct rate if available, otherwise calculate from subtotal/qty
      let effectiveRate = 0;
      if (item.rate !== undefined && !item.labour && !item.equipment) {
        // Simple item with direct rate
        effectiveRate = Number(item.rate) || 0;
      } else {
        // Complex item - calculate rate from subtotal divided by quantity
        const subtotal = Number(item.subtotal) || 0;
        const qty = Number(item.qty) || 1;
        effectiveRate = qty > 0 ? subtotal / qty : subtotal;
      }

      // Always show rate
      output += `- **Rate:** $${effectiveRate.toFixed(2)}\n`;

      // Format labour if present
      if (item.labour) {
        output += `- **Labour:**\n`;
        if (item.labour.masterQualified) {
          const hours = Number(item.labour.masterQualified.hours) || 0;
          const rate = Number(item.labour.masterQualified.rate) || 0;
          const subtotal = hours * rate;
          output += `  - Master Qualified: ${hours} hrs @ $${rate.toFixed(2)}/hr = $${subtotal.toFixed(2)}\n`;
        }
        if (item.labour.qualified) {
          const hours = Number(item.labour.qualified.hours) || 0;
          const rate = Number(item.labour.qualified.rate) || 0;
          const subtotal = hours * rate;
          output += `  - Qualified: ${hours} hrs @ $${rate.toFixed(2)}/hr = $${subtotal.toFixed(2)}\n`;
        }
        if (item.labour.labourer) {
          const hours = Number(item.labour.labourer.hours) || 0;
          const rate = Number(item.labour.labourer.rate) || 0;
          const subtotal = hours * rate;
          output += `  - Labourer: ${hours} hrs @ $${rate.toFixed(2)}/hr = $${subtotal.toFixed(2)}\n`;
        }
      }

      // Format equipment if present
      if (item.equipment) {
        output += `- **Equipment:**\n`;
        if (item.equipment.airMovers) {
          const qty = Number(item.equipment.airMovers.qty) || 0;
          const days = Number(item.equipment.airMovers.days) || 0;
          const rate = Number(item.equipment.airMovers.rate) || 0;
          const subtotal = qty * days * rate;
          output += `  - Air Movers: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`;
        }
        if (item.equipment.dehumidifiers) {
          const qty = Number(item.equipment.dehumidifiers.qty) || 0;
          const days = Number(item.equipment.dehumidifiers.days) || 0;
          const rate = Number(item.equipment.dehumidifiers.rate) || 0;
          const subtotal = qty * days * rate;
          output += `  - Dehumidifiers: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`;
        }
        if (item.equipment.afd) {
          const qty = Number(item.equipment.afd.qty) || 0;
          const days = Number(item.equipment.afd.days) || 0;
          const rate = Number(item.equipment.afd.rate) || 0;
          const subtotal = qty * days * rate;
          output += `  - AFD: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`;
        }
        if (item.equipment.thermalCamera) {
          const qty = Number(item.equipment.thermalCamera.qty) || 0;
          const rate = Number(item.equipment.thermalCamera.rate) || 0;
          const subtotal = qty * rate;
          output += `  - Thermal Camera: ${qty} assessments @ $${rate.toFixed(2)}/assessment = $${subtotal.toFixed(2)}\n`;
        }
        if (item.equipment.injectionSystem) {
          const qty = Number(item.equipment.injectionSystem.qty) || 0;
          const days = Number(item.equipment.injectionSystem.days) || 0;
          const rate = Number(item.equipment.injectionSystem.rate) || 0;
          const subtotal = qty * days * rate;
          output += `  - Injection Drying System: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`;
        }
      }

      const subtotal = Number(item.subtotal) || 0;
      output += `- **Subtotal:** $${subtotal.toFixed(2)}\n\n`;
    });
    return output;
  };

  // Format licensed trades
  const formatLicensedTrades = (trades: any[]) => {
    if (!trades || trades.length === 0) {
      return "No licensed trades required for this scope.";
    }
    return trades
      .map((trade: any) => {
        return `### ${trade.trade}
- **Trigger:** ${trade.trigger}
- **Scope:** ${trade.scope}
- **Cost Status:** ${trade.costStatus}
- **Timeline:** ${trade.timeline}
`;
      })
      .join("\n");
  };

  // Build complete document
  let document = `# PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE

Based on: Inspection Report ${scopeData.claimReference || "Reference"}
Date: ${scopeData.date}
Version: ${scopeData.version}

# SECTION 1: REMEDIATION PHASES

## PHASE 1: Emergency Response & Stabilisation
- **Duration:** Day 0–1
- **Activities:** Site assessment, standing water extraction, initial equipment deployment, moisture/thermal imaging, site signage, client notification, authority notifications
- **Deliverable:** Equipment operational; standing water removed

## PHASE 2: Drying & Monitoring
- **Duration:** Days 1–${scopeData.dryingDuration} (${scopeData.hasClass4Drying ? "Class 4" : "standard"})
- **Activities:** Continuous equipment operation, daily moisture monitoring, thermal imaging, client check-ins, containment management, air quality monitoring
- **Deliverable:** Moisture levels approaching acceptable

## PHASE 3: Validation & Equipment Removal
- **Duration:** Day ${scopeData.dryingDuration}–${scopeData.dryingDuration + 1}
- **Activities:** Final moisture testing, visual inspection, certification, equipment collection, site cleanup, documentation
- **Deliverable:** Restoration works complete

## PHASE 4: Licensed Trades & Building Repairs (Outside Restoration Scope)
- **Duration:** Variable
- **Activities:** ${scopeData.licensedTrades.map((t: any) => t.trade).join(", ") || "None required"}
- **Deliverable:** Building code compliance; structural integrity restored

## PHASE 5: Contents Restoration (If Applicable)
- **Duration:** Variable
- **Activities:** Carpet cleaning/replacement, furniture restoration, appliance testing, contents itemisation
- **Deliverable:** Contents restored to pre-loss condition

# SECTION 2: RESTORATION WORKS ONLY

${formatLineItems(scopeData.lineItems)}

# SECTION 3: LICENSED TRADES REQUIRED

${formatLicensedTrades(scopeData.licensedTrades)}

# SECTION 4: INSURANCE CLAIM BREAKDOWN

## BUILDING CLAIM (Structural & Systems)
- Water damage to structure
- Restoration services
${scopeData.hasClass4Drying ? "- Yellow tongue subfloor replacement (if beyond recovery)" : ""}
${
  scopeData.licensedTrades
    .filter((t: any) =>
      ["Plumbing", "Electrical", "Builder/Carpenter"].includes(t.trade),
    )
    .map((t: any) => `- ${t.trade} repair/replacement`)
    .join("\n") || ""
}

## CONTENTS CLAIM (Personal Property)
- Carpets and flooring coverings
- Furniture and textiles
- Electrical appliances
- Personal items

## ADDITIONAL LIVING EXPENSES (if property uninhabitable)
- Temporary accommodation
- Meals and personal care
- Storage for displaced contents

# SECTION 5: COORDINATION AND SEQUENCING NOTES

Critical sequencing information:
${scopeData.licensedTrades.some((t: any) => t.trade === "Plumbing") ? "- Plumbing must be completed BEFORE drying begins" : ""}
${scopeData.licensedTrades.some((t: any) => t.trade === "Electrical") ? "- Electrical clearance required BEFORE equipment activation" : ""}
${scopeData.hasClass4Drying ? "- Class 4 drying: Specialist assessment takes priority" : ""}
${scopeData.licensedTrades.some((t: any) => t.trade.includes("Mould")) ? "- Mould remediation: Work stops immediately; restoration resumes post-clearance" : ""}
${scopeData.licensedTrades.some((t: any) => t.trade.includes("Asbestos")) ? "- Asbestos abatement: All work suspended; WorkSafe clearance mandatory" : ""}
- Building repairs: May occur concurrently with final drying phase
- Contents restoration: Final phase after building is dry

# SECTION 6: CLIENT EDIT FIELDS

Note: All line items, quantities, rates, and calculations can be edited by the admin before finalising. System maintains calculation formulas but allows manual override.
`;

  // RA-7006 Gap 1: surface the RA-7005 safety reconciliation so a scoped
  // configuration that contradicts the safety plan (air movers over active
  // mould, or over the power budget) is never hidden.
  const safety = scopeData.safety;
  if (safety && safety.advisories?.length) {
    const ordered = [...safety.advisories].sort((a: any, b: any) =>
      a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
    );
    document += `\n# SECTION 7: EQUIPMENT SAFETY RECONCILIATION (RA-7005)\n\n`;
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

// Legacy function - kept for reference but not used
function buildScopeOfWorksPrompt(scopeData: any): string {
  return `Generate a comprehensive Scope of Works document for RestoreAssist with the following structure:

# SCOPE OF WORKS DATA

## Header Information
- Title: PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE
- Based on: Inspection Report ${scopeData.claimReference || "Reference"}
- Date: ${scopeData.date}
- Version: ${scopeData.version}

## Restoration Works Line Items
${JSON.stringify(scopeData.lineItems, null, 2)}

## Licensed Trades Required
${JSON.stringify(scopeData.licensedTrades, null, 2)}

## State Information
${scopeData.stateInfo ? `${scopeData.stateInfo.name} - ${scopeData.stateInfo.buildingAuthority}` : "Not specified"}

## Key Details
- Water Category: ${scopeData.waterCategory}
- Drying Duration: ${scopeData.dryingDuration} days
- Affected Area: ${scopeData.affectedAreaSqm} sqm
- Class 4 Drying: ${scopeData.hasClass4Drying ? "Yes" : "No"}
- Hazards: ${scopeData.hazards.join(", ") || "None"}

# DOCUMENT STRUCTURE REQUIREMENTS

Generate a comprehensive Scope of Works document with ALL of the following sections:

## HEADER
- "PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE"
- Based on: [Inspection Report Reference]
- Date: [today's date]
- Version: [1.0]

## SECTION 1: REMEDIATION PHASES

### PHASE 1: Emergency Response & Stabilisation
- Duration: Day 0–1
- Activities: Site assessment, standing water extraction, initial equipment deployment, moisture/thermal imaging, site signage, client notification, authority notifications
- Deliverable: Equipment operational; standing water removed

### PHASE 2: Drying & Monitoring
- Duration: Days 1–${scopeData.dryingDuration} (${scopeData.hasClass4Drying ? "Class 4" : "standard"})
- Activities: Continuous equipment operation, daily moisture monitoring, thermal imaging, client check-ins, containment management, air quality monitoring
- Deliverable: Moisture levels approaching acceptable

### PHASE 3: Validation & Equipment Removal
- Duration: Day ${scopeData.dryingDuration}–${scopeData.dryingDuration + 1}
- Activities: Final moisture testing, visual inspection, certification, equipment collection, site cleanup, documentation
- Deliverable: Restoration works complete

### PHASE 4: Licensed Trades & Building Repairs (Outside Restoration Scope)
- Duration: Variable
- Activities: ${scopeData.licensedTrades.map((t: any) => t.trade).join(", ") || "None required"}
- Deliverable: Building code compliance; structural integrity restored

### PHASE 5: Contents Restoration (If Applicable)
- Duration: Variable
- Activities: Carpet cleaning/replacement, furniture restoration, appliance testing, contents itemisation
- Deliverable: Contents restored to pre-loss condition

## SECTION 2: RESTORATION WORKS ONLY

List each line item (RW_1 through RW_10) with:
- Description
- Quantity
- Unit
- Rate (from pricing configuration)
- Subtotal (calculated)

Include labour breakdowns and equipment breakdowns where applicable.

## SECTION 3: LICENSED TRADES REQUIRED

${
  scopeData.licensedTrades.length > 0
    ? `For each trade, include:
- Trade name
- Trigger condition
- Scope of work
- Cost Status: Specialist quote required
- Timeline
- Notes`
    : "No licensed trades required for this scope."
}

## SECTION 4: INSURANCE CLAIM BREAKDOWN

### BUILDING CLAIM (Structural & Systems)
- Water damage to structure
- Restoration services
- ${scopeData.hasClass4Drying ? "Yellow tongue subfloor replacement (if beyond recovery)" : ""}
- ${
    scopeData.licensedTrades
      .filter((t: any) =>
        ["Plumbing", "Electrical", "Builder/Carpenter"].includes(t.trade),
      )
      .map((t: any) => t.trade + " repair/replacement")
      .join(", ") || ""
  }

### CONTENTS CLAIM (Personal Property)
- Carpets and flooring coverings
- Furniture and textiles
- Electrical appliances
- Personal items

### ADDITIONAL LIVING EXPENSES (if property uninhabitable)
- Temporary accommodation
- Meals and personal care
- Storage for displaced contents

## SECTION 5: COORDINATION AND SEQUENCING NOTES

Critical sequencing information:
${scopeData.licensedTrades.some((t: any) => t.trade === "Plumbing") ? "- Plumbing must be completed BEFORE drying begins" : ""}
${scopeData.licensedTrades.some((t: any) => t.trade === "Electrical") ? "- Electrical clearance required BEFORE equipment activation" : ""}
${scopeData.hasClass4Drying ? "- Class 4 drying: Specialist assessment takes priority" : ""}
${scopeData.licensedTrades.some((t: any) => t.trade.includes("Mould")) ? "- Mould remediation: Work stops immediately; restoration resumes post-clearance" : ""}
${scopeData.licensedTrades.some((t: any) => t.trade.includes("Asbestos")) ? "- Asbestos abatement: All work suspended; WorkSafe clearance mandatory" : ""}
- Building repairs: May occur concurrently with final drying phase
- Contents restoration: Final phase after building is dry

## SECTION 6: CLIENT EDIT FIELDS

Note: All line items, quantities, rates, and calculations can be edited by the admin before finalising.

Format the document professionally with clear sections, proper formatting, and all calculations displayed.`;
}
