import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectStateFromPostcode, getStateInfo } from "@/lib/state-detection";
import {
  getEquipmentGroupById,
  getEquipmentDailyRate,
} from "@/lib/equipment-matrix";
import { getLatestAIIntegration, callAIProvider } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  hasValue,
  extractMaterialsFromReport,
  extractWaterCategory,
  extractAverageMoisture,
} from "@/lib/reports/extract-report-data";

// POST - Generate complete professional inspection report with all 13 sections
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 10 inspection report generations per 15 minutes per user
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "gen-inspection",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        businessAddress: true,
        businessLogo: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        subscriptionStatus: true,
        pricingConfig: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Subscription gate — CANCELED/PAST_DUE users must not run AI generation
    const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        {
          error: "Active subscription required to generate reports",
          upgradeRequired: true,
        },
        { status: 402 },
      );
    }

    const { reportId, reportType = "enhanced" } = await request.json();

    if (!reportId) {
      return NextResponse.json(
        { error: "Report ID is required" },
        { status: 400 },
      );
    }

    // Get the complete report with all data, including client information
    const report = await prisma.report.findUnique({
      where: { id: reportId, userId: user.id },
      include: {
        client: {
          select: {
            company: true,
            name: true,
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

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
    const psychrometricAssessment = report.psychrometricAssessment
      ? JSON.parse(report.psychrometricAssessment)
      : null;
    const scopeAreas = report.scopeAreas ? JSON.parse(report.scopeAreas) : null;
    const equipmentSelection = report.equipmentSelection
      ? JSON.parse(report.equipmentSelection)
      : null;

    // Detect state from postcode
    const stateCode = detectStateFromPostcode(report.propertyPostcode || "");
    const stateInfo = getStateInfo(stateCode);

    // Get appropriate API key based on subscription status
    // Free users: uses ANTHROPIC_API_KEY from .env
    // Upgraded users: uses API key from integrations
    const { getAnthropicApiKey, getLatestAIIntegration } =
      await import("@/lib/ai-provider");

    // Try to get integration first (for upgraded users)
    let aiIntegration = await getLatestAIIntegration(user.id);
    let anthropicApiKey: string;

    if (!aiIntegration) {
      // For free users, get API key from .env
      try {
        anthropicApiKey = await getAnthropicApiKey(user.id);
        // Create a synthetic integration object for callAIProvider
        aiIntegration = {
          id: "env-anthropic",
          name: "Anthropic Claude (Free Tier)",
          apiKey: anthropicApiKey,
          provider: "anthropic" as const,
        };
      } catch (error: any) {
        return NextResponse.json(
          {
            error:
              error.message ||
              "Failed to get Anthropic API key. Please ensure ANTHROPIC_API_KEY is configured in environment variables.",
          },
          { status: 400 },
        );
      }
    } else {
      // For upgraded users, use the integration's API key
      anthropicApiKey = aiIntegration.apiKey;
    }

    // Use the API key for standards retrieval
    const standardsApiKey = anthropicApiKey;

    // STAGE 1: Retrieve relevant standards from Google Drive (IICRC Standards folder)
    let standardsContext = "";
    try {
      const { retrieveRelevantStandards, buildStandardsContextPrompt } =
        await import("@/lib/standards-retrieval");

      // Determine report type
      const retrievalReportType:
        | "mould"
        | "fire"
        | "commercial"
        | "water"
        | "general" =
        reportType === "mould"
          ? "mould"
          : reportType === "fire"
            ? "fire"
            : reportType === "commercial"
              ? "commercial"
              : "water";

      const retrievalQuery = {
        reportType: retrievalReportType,
        waterCategory: report.waterCategory as "1" | "2" | "3" | undefined,
        keywords: [
          report.waterCategory ? `Category ${report.waterCategory}` : "",
          report.waterClass ? `Class ${report.waterClass}` : "",
        ].filter(Boolean),
        materials: extractMaterialsFromReport(report),
        technicianNotes: report.technicianFieldReport?.substring(0, 1000) || "",
      };

      const retrievedStandards = await retrieveRelevantStandards(
        retrievalQuery,
        standardsApiKey,
      );

      standardsContext = buildStandardsContextPrompt(retrievedStandards);

      if (standardsContext.length > 0) {
      } else {
      }
    } catch (error: any) {
      // Continue without standards - report will use general knowledge
    }

    // Get NIR data from Report model (stored in moistureReadings field as JSON)
    let inspectionData = null;
    try {
      // Parse NIR data from Report.moistureReadings JSON field
      if (report.moistureReadings) {
        const nirData = JSON.parse(report.moistureReadings);

        inspectionData = {
          moistureReadings: nirData.moistureReadings || [],
          affectedAreas: nirData.affectedAreas || [],
          scopeItems: nirData.scopeItems || [],
          photos: nirData.photos || [],
          environmentalData: null, // Not stored in NIR data, will use psychrometric fallback
          classifications: [],
          costEstimates: [],
        };
      }
    } catch (error) {
      // Continue without NIR data - report generation will use other Report model data
      inspectionData = null;
    }

    // For basic and enhanced reports, use structured data directly from Report model (no AI - ensures 100% accurate data)
    if (reportType === "basic" || reportType === "enhanced") {
      // Build structured data directly from actual Report model data - NO AI, ensures all real data is used
      const structuredReportData = buildStructuredBasicReport({
        report,
        analysis,
        stateInfo,
        psychrometricAssessment,
        scopeAreas,
        equipmentSelection,
        inspectionData,
        tier1,
        tier2,
        tier3,
        businessInfo: {
          businessName: user.businessName,
          businessAddress: user.businessAddress,
          businessLogo: user.businessLogo,
          businessABN: user.businessABN,
          businessPhone: user.businessPhone,
          businessEmail: user.businessEmail,
        },
      });

      // Save the structured report as JSON
      await prisma.report.update({
        where: { id: reportId },
        data: {
          detailedReport: JSON.stringify(structuredReportData),
          reportDepthLevel: reportType === "basic" ? "Basic" : "Enhanced",
          status: "PENDING",
        },
      });

      return NextResponse.json({
        report: {
          id: reportId,
          structuredData: structuredReportData,
        },
        message: `${reportType === "basic" ? "Basic" : "Enhanced"} inspection report generated successfully`,
      });
    }

    // For optimised reports, use AI generation
    const prompt = buildInspectionReportPrompt({
      report,
      analysis,
      tier1,
      tier2,
      tier3,
      stateInfo,
      reportType,
      standardsContext,
      psychrometricAssessment,
      scopeAreas,
      equipmentSelection,
      businessInfo: {
        businessName: user.businessName,
        businessAddress: user.businessAddress,
        businessLogo: user.businessLogo,
        businessABN: user.businessABN,
        businessPhone: user.businessPhone,
        businessEmail: user.businessEmail,
      },
    });

    const systemPrompt = `You are RestoreAssist, an expert water damage restoration documentation system built for Australian restoration company administration teams. Generate comprehensive, professional inspection reports that strictly adhere to ALL relevant Australian standards, laws, regulations, and best practices. You MUST explicitly reference specific standards, codes, and regulations throughout the report.

CRITICAL: Only use the actual data provided in the REPORT DATA section above. Do NOT:
- Use placeholder text like "Not provided", "Not specified", "N/A", "Unknown", or similar
- Make up or invent information that is not in the provided data
- Include sections for which no data was provided
- Use dummy or default values

Only include information that is explicitly provided in the REPORT DATA section. If a field is not provided, do not mention it in the report.

BUSINESS INFORMATION: If business information is provided in the REPORT DATA section (Business Name, Business Address, Business ABN, Business Phone, Business Email), you MUST include this information in the report header/footer and use the business name as the reporting company name throughout the report. The business logo URL can be referenced if needed for document formatting.`;

    // Generate report using the selected AI provider
    let inspectionReport = "";
    try {
      inspectionReport = await callAIProvider(aiIntegration, {
        system: systemPrompt,
        prompt,
        maxTokens: 16000,
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          error: "Failed to generate inspection report",
          details: error.message || "Unknown error occurred",
        },
        { status: 500 },
      );
    }

    if (!inspectionReport || inspectionReport.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Failed to generate inspection report: Empty response from AI",
        },
        { status: 500 },
      );
    }

    // Save the generated report
    await prisma.report.update({
      where: { id: reportId },
      data: {
        detailedReport: inspectionReport,
        reportDepthLevel: report.reportDepthLevel || "Enhanced",
        status: "PENDING",
      },
    });

    return NextResponse.json({
      report: {
        id: reportId,
        detailedReport: inspectionReport,
      },
      message: "Inspection report generated successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate inspection report" },
      { status: 500 },
    );
  }
}

function buildInspectionReportPrompt(data: {
  report: any;
  analysis: any;
  tier1: any;
  tier2: any;
  tier3: any;
  stateInfo: any;
  reportType: string;
  standardsContext?: string;
  psychrometricAssessment?: any;
  scopeAreas?: any[];
  equipmentSelection?: any[];
  businessInfo?: {
    businessName?: string | null;
    businessAddress?: string | null;
    businessLogo?: string | null;
    businessABN?: string | null;
    businessPhone?: string | null;
    businessEmail?: string | null;
  };
}): string {
  const {
    report,
    analysis,
    tier1,
    tier2,
    tier3,
    stateInfo,
    reportType,
    standardsContext,
    psychrometricAssessment,
    scopeAreas,
    equipmentSelection,
    businessInfo,
  } = data;

  // Log if standards context is provided
  if (standardsContext && standardsContext.length > 0) {
  } else {
  }

  // Extract water category from tier1 or analysis (only if exists)
  const waterCategory = tier1?.T1_Q3_waterSource
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : analysis?.waterCategory || null;

  // Extract hazards from tier1
  const hazards = tier1?.T1_Q7_hazards || [];
  const hasHazards = hazards.length > 0 && !hazards.includes("None identified");

  // Extract materials from tier1
  const materials = tier1?.T1_Q6_materialsAffected || [];

  // Extract occupancy info (only if exists)
  const occupancyStatus = tier1?.T1_Q4_occupancyStatus || null;
  const petsPresent = tier1?.T1_Q4_petsPresent || null;
  const isOccupied = occupancyStatus
    ? occupancyStatus.includes("Occupied")
    : false;
  const hasVulnerablePersons = occupancyStatus
    ? occupancyStatus.includes("children") ||
      occupancyStatus.includes("elderly") ||
      occupancyStatus.includes("respiratory") ||
      occupancyStatus.includes("disability")
    : false;

  // Extract water duration (only if exists)
  const waterDuration = tier1?.T1_Q8_waterDuration || null;

  // Extract affected areas (only if exists)
  const affectedAreas =
    tier1?.T1_Q5_roomsAffected || analysis?.affectedAreas?.join(", ") || null;

  // Extract equipment from tier2 or analysis (only if exists)
  const equipmentDeployed =
    tier2?.T2_Q3_equipmentDeployed ||
    analysis?.equipmentDeployed?.join(", ") ||
    null;

  // Extract moisture readings (only if exists)
  const moistureReadings = tier2?.T2_Q1_moistureReadings || null;

  // Extract water migration pattern (only if exists)
  const waterMigration = tier2?.T2_Q2_waterMigrationPattern || null;

  // Extract affected contents (only if exists)
  const affectedContents = tier2?.T2_Q4_affectedContents || null;

  // Extract structural concerns (only if exists)
  const structuralConcerns = tier2?.T2_Q5_structuralConcerns || [];

  // Extract building services affected (only if exists)
  const buildingServices = tier2?.T2_Q6_buildingServicesAffected || [];

  // Extract insurance considerations (only if exists)
  const insuranceConsiderations = tier2?.T2_Q7_insuranceConsiderations || null;

  // Extract timeline requirements (only if exists)
  const timelineRequirements = tier3?.T3_Q1_timelineRequirements || null;

  // Extract drying preferences (only if exists)
  const dryingPreferences = tier3?.T3_Q2_dryingPreferences || null;

  // Extract chemical treatment (only if exists)
  const chemicalTreatment = tier3?.T3_Q3_chemicalTreatment || null;

  // Extract total affected area (only if exists)
  const totalAffectedArea = tier3?.T3_Q4_totalAffectedArea || null;

  // Extract class 4 drying assessment (only if exists)
  const class4Drying = tier3?.T3_Q5_class4DryingAssessment || null;

  // Build state-specific regulatory text
  const stateRegulatoryText = stateInfo
    ? `State: ${stateInfo.name} (${stateInfo.code})
Building Authority: ${stateInfo.buildingAuthority}
Building Code: ${stateInfo.buildingCode}
Work Safety Authority: ${stateInfo.workSafetyAuthority} (Contact: ${stateInfo.workSafetyContact})
EPA Authority: ${stateInfo.epaAuthority} (Contact: ${stateInfo.epaContact})
WHS Act: ${stateInfo.whsAct}
EPA Act: ${stateInfo.epaAct}`
    : "State information not available (postcode required)";

  // Calculate total amps from equipment selection (only if equipment exists)
  const totalAmps =
    equipmentSelection && equipmentSelection.length > 0
      ? equipmentSelection.reduce((total: number, sel: any) => {
          const group = getEquipmentGroupById(sel.groupId);
          return total + (group?.amps || 0) * (sel.quantity || 0);
        }, 0)
      : 0;

  // Ensure totalAmps is always a number
  const totalAmpsNumber =
    typeof totalAmps === "number"
      ? totalAmps
      : parseFloat(String(totalAmps)) || 0;

  // Calculate visual metrics for basic reports
  const roomsAffectedCount = affectedAreas
    ? Array.isArray(affectedAreas)
      ? affectedAreas.length
      : affectedAreas.split(",").length
    : 0;
  const materialsList =
    materials.length > 0 ? materials.join(", ") : "Not specified";
  const avgMoisture = moistureReadings
    ? extractAverageMoisture(moistureReadings)
    : null;
  const totalEquipmentUnits =
    equipmentSelection && equipmentSelection.length > 0
      ? equipmentSelection.reduce(
          (sum: number, sel: any) => sum + sel.quantity,
          0,
        )
      : 0;
  const totalLitresExtracted = report.dehumidificationCapacity || null;
  const dryingIndex =
    psychrometricAssessment?.dryingPotential?.dryingIndex || null;
  const dryingStatus = psychrometricAssessment?.dryingPotential?.status || null;

  // If basic report, use visual-centric prompt
  if (reportType === "basic") {
    return buildVisualCentricReportPrompt({
      report,
      analysis,
      tier1,
      tier2,
      tier3,
      stateInfo,
      standardsContext,
      psychrometricAssessment,
      scopeAreas,
      equipmentSelection,
      waterCategory,
      materials,
      affectedAreas,
      moistureReadings,
      equipmentDeployed,
      roomsAffectedCount,
      materialsList,
      avgMoisture,
      totalEquipmentUnits,
      totalLitresExtracted,
      dryingIndex,
      dryingStatus,
      totalAmpsNumber,
      hazards,
      hasHazards,
      occupancyStatus,
      isOccupied,
      hasVulnerablePersons,
      petsPresent,
      waterDuration,
      waterMigration,
      affectedContents,
      structuralConcerns,
      buildingServices,
      insuranceConsiderations,
      timelineRequirements,
      dryingPreferences,
      chemicalTreatment,
      totalAffectedArea,
      class4Drying,
      estimatedDryingDuration: report.estimatedDryingDuration,
      equipmentCostTotal: report.equipmentCostTotal,
    });
  }

  return `Generate a comprehensive Professional Inspection Report for RestoreAssist with the following structure. This is a ${reportType === "basic" ? "BASIC" : "ENHANCED"} report.

# REPORT DATA

## Business Information
${businessInfo?.businessName ? `- Business Name: ${businessInfo.businessName}` : ""}
${businessInfo?.businessAddress ? `- Business Address: ${businessInfo.businessAddress}` : ""}
${businessInfo?.businessABN ? `- Business ABN: ${businessInfo.businessABN}` : ""}
${businessInfo?.businessPhone ? `- Business Phone: ${businessInfo.businessPhone}` : ""}
${businessInfo?.businessEmail ? `- Business Email: ${businessInfo.businessEmail}` : ""}
${businessInfo?.businessLogo ? `- Business Logo URL: ${businessInfo.businessLogo}` : ""}

## Cover Page Information
- Report Title: ${businessInfo?.businessName || "RestoreAssist"} Inspection Report
${report.claimReferenceNumber || report.reportNumber ? `- Claim Reference: ${report.claimReferenceNumber || report.reportNumber}` : ""}
- Date Generated: ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}
- Property Address: ${report.propertyAddress}
${report.propertyPostcode ? `- Postcode: ${report.propertyPostcode}` : ""}
- Client Name: ${report.clientName}
${report.clientContactDetails ? `- Client Contact: ${report.clientContactDetails}` : ""}
${report.technicianName ? `- Technician Name: ${report.technicianName}` : ""}
- Report Depth Level: ${report.reportDepthLevel || (reportType === "basic" ? "Basic" : "Enhanced")}
- Version: ${report.reportVersion || 1}

## Incident Information
${report.incidentDate ? `- Date of Loss: ${new Date(report.incidentDate).toLocaleDateString("en-AU")}` : ""}
${report.technicianAttendanceDate ? `- Technician Attendance Date: ${new Date(report.technicianAttendanceDate).toLocaleDateString("en-AU")}` : ""}
${tier1?.T1_Q3_waterSource || analysis?.waterSource ? `- Water Source: ${tier1?.T1_Q3_waterSource || analysis?.waterSource}` : ""}
${waterCategory ? `- Water Category: ${waterCategory}` : ""}
${waterDuration ? `- Water Duration: ${waterDuration}` : ""}

## Property Information
${tier1?.T1_Q1_propertyType ? `- Property Type: ${tier1.T1_Q1_propertyType}` : ""}
${tier1?.T1_Q2_constructionYear ? `- Construction Year: ${tier1.T1_Q2_constructionYear}` : ""}
${occupancyStatus ? `- Occupancy Status: ${occupancyStatus}` : ""}
${petsPresent ? `- Pets Present: ${petsPresent}` : ""}

${
  affectedAreas
    ? `## Affected Areas
${affectedAreas}`
    : ""
}

${
  materials.length > 0
    ? `## Affected Materials
${materials.join(", ")}`
    : ""
}

${
  equipmentSelection && equipmentSelection.length > 0
    ? `## Equipment Selection
${equipmentSelection
  .map((sel: any) => {
    const group = getEquipmentGroupById(sel.groupId);
    const dailyRate = sel.dailyRate || 0;
    const itemDailyTotal = dailyRate * sel.quantity;
    const itemTotalCost =
      itemDailyTotal * (report.estimatedDryingDuration || 1);
    return `- ${group?.name || sel.groupId}: ${sel.quantity} units × $${dailyRate.toFixed(2)}/day = $${itemDailyTotal.toFixed(2)}/day (Total: $${itemTotalCost.toFixed(2)})`;
  })
  .join("\n")}
- Total Daily Cost: $${equipmentSelection
        .reduce((sum: number, sel: any) => {
          const dailyRate = sel.dailyRate || 0;
          return sum + dailyRate * sel.quantity;
        }, 0)
        .toFixed(2)}
- Estimated Duration: ${report.estimatedDryingDuration || "N/A"} days
- Total Equipment Cost: $${report.equipmentCostTotal?.toFixed(2) || "0.00"}
`
    : equipmentDeployed
      ? `## Equipment Deployed
${equipmentDeployed}`
      : ""
}

${
  moistureReadings
    ? `## Moisture Readings
${moistureReadings}`
    : ""
}

${
  waterMigration
    ? `## Water Migration Pattern
${waterMigration}`
    : ""
}

${
  affectedContents
    ? `## Affected Contents
${affectedContents}`
    : ""
}

${
  structuralConcerns.length > 0
    ? `## Structural Concerns
${structuralConcerns.join(", ")}`
    : ""
}

${
  buildingServices.length > 0
    ? `## Building Services Affected
${buildingServices.join(", ")}`
    : ""
}

${
  hazards.length > 0 && hasHazards
    ? `## Hazards Identified
${hazards.join(", ")}`
    : ""
}

${
  insuranceConsiderations
    ? `## Insurance Considerations
${insuranceConsiderations}`
    : ""
}

${
  timelineRequirements ||
  dryingPreferences ||
  chemicalTreatment ||
  totalAffectedArea ||
  class4Drying
    ? `## Timeline & Preferences
${timelineRequirements ? `- Timeline Requirements: ${timelineRequirements}` : ""}
${dryingPreferences ? `- Drying Preferences: ${dryingPreferences}` : ""}
${chemicalTreatment ? `- Chemical Treatment: ${chemicalTreatment}` : ""}
${totalAffectedArea ? `- Total Affected Area: ${totalAffectedArea}` : ""}
${class4Drying ? `- Class 4 Drying Assessment: ${class4Drying}` : ""}`
    : ""
}

## State Regulatory Framework
${stateRegulatoryText}

${
  report.technicianFieldReport
    ? `## Technician Field Report
${report.technicianFieldReport}`
    : ""
}

${
  psychrometricAssessment
    ? `## Psychrometric Assessment Data
${psychrometricAssessment.waterClass ? `- Water Loss Class: Class ${psychrometricAssessment.waterClass}` : ""}
${psychrometricAssessment.temperature ? `- Temperature: ${psychrometricAssessment.temperature}°C` : ""}
${psychrometricAssessment.humidity ? `- Humidity: ${psychrometricAssessment.humidity}%` : ""}
${psychrometricAssessment.systemType ? `- System Type: ${psychrometricAssessment.systemType} Ventilation` : ""}
${psychrometricAssessment.dryingPotential?.dryingIndex ? `- Drying Index: ${psychrometricAssessment.dryingPotential.dryingIndex}` : ""}
${psychrometricAssessment.dryingPotential?.status ? `- Drying Status: ${psychrometricAssessment.dryingPotential.status}` : ""}
${psychrometricAssessment.dryingPotential?.recommendation ? `- Recommendation: ${psychrometricAssessment.dryingPotential.recommendation}` : ""}

${
  scopeAreas && scopeAreas.length > 0
    ? `## Scope Areas (${scopeAreas.length} areas)
${scopeAreas
  .map(
    (area: any, idx: number) => `
Area ${idx + 1}: ${area.name}
- Dimensions: ${area.length}m × ${area.width}m × ${area.height}m
- Volume: ${(area.length * area.width * area.height).toFixed(1)} m³
- Wet Area: ${(area.length * area.width * (area.wetPercentage / 100)).toFixed(1)} m²
- Wet Percentage: ${area.wetPercentage}%
`,
  )
  .join("\n")}
- Total Volume: ${scopeAreas.reduce((sum: number, a: any) => sum + a.length * a.width * a.height, 0).toFixed(1)} m³
- Total Affected Area: ${scopeAreas.reduce((sum: number, a: any) => sum + a.length * a.width * (a.wetPercentage / 100), 0).toFixed(1)} m²
`
    : ""
}

${
  equipmentSelection && equipmentSelection.length > 0
    ? `## Equipment Selection
${equipmentSelection
  .map((sel: any) => {
    const group = getEquipmentGroupById(sel.groupId);
    const dailyRate = sel.dailyRate || 0;
    const itemDailyTotal = dailyRate * sel.quantity;
    const itemTotalCost =
      itemDailyTotal * (report.estimatedDryingDuration || 1);
    return `- ${group?.name || sel.groupId}: ${sel.quantity} units × $${dailyRate.toFixed(2)}/day = $${itemDailyTotal.toFixed(2)}/day (Total: $${itemTotalCost.toFixed(2)})`;
  })
  .join("\n")}
- Total Daily Cost: $${equipmentSelection
        .reduce((sum: number, sel: any) => {
          const dailyRate = sel.dailyRate || 0;
          return sum + dailyRate * sel.quantity;
        }, 0)
        .toFixed(2)}
- Estimated Duration: ${report.estimatedDryingDuration || "N/A"} days
- Total Equipment Cost: $${report.equipmentCostTotal?.toFixed(2) || "0.00"}
`
    : ""
}
`
    : ""
}

${standardsContext ? standardsContext + "\n\n" : ""}

# REPORT STRUCTURE REQUIREMENTS

${standardsContext ? '**IMPORTANT: The standards documents above have been retrieved from the Google Drive "IICRC Standards" folder. You MUST reference and cite specific sections from these documents throughout the report. Use exact standard numbers, section references, and terminology from the retrieved documents.**\n\n' : ""}

${data.standardsContext ? '**IMPORTANT: The standards documents above have been retrieved from the Google Drive "IICRC Standards" folder. You MUST reference and cite specific sections from these documents throughout the report. Use exact standard numbers, section references, and terminology from the retrieved documents.**\n\n' : ""}

Generate a comprehensive Professional Inspection Report with ALL of the following sections. **CRITICAL: You MUST use proper Markdown heading syntax (# for H1, ## for H2, ### for H3) for all section headers. Do NOT use plain text for section titles.**

# PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE

## RestoreAssist Inspection Report

Include all cover page information listed above in a structured format.

## SECTION 1: EXECUTIVE SUMMARY
One paragraph overview including:
- Type of incident
- Areas affected
- Primary remediation approach
- Key compliance considerations
Use the example format provided in the specification.

## SECTION 2: LOSS DETAILS
- Date of Loss & Discovery Timeline
- Source of Water Ingress (with IICRC Category classification)
- Weather/Environmental Context (if Tier 2/3 completed)
- Client Contact & Occupancy Status
- Technician Attendance Notes

## SECTION 3: PSYCHROMETRIC ASSESSMENT
${
  psychrometricAssessment
    ? `Include a comprehensive psychrometric assessment section with:

### KEY PERFORMANCE METRICS
**CRITICAL: Use ### for subsection headers like this one.**
${psychrometricAssessment.dryingPotential?.dryingIndex ? `- Drying Index: ${psychrometricAssessment.dryingPotential.dryingIndex}${psychrometricAssessment.dryingPotential?.status ? ` (Status: ${psychrometricAssessment.dryingPotential.status})` : ""}` : ""}
${report.dehumidificationCapacity ? `- Litres/Day Target: ${report.dehumidificationCapacity} L/Day` : ""}
${report.airmoversCount ? `- Air Movers Required: ${report.airmoversCount} units` : ""}
${scopeAreas && scopeAreas.length > 0 ? `- Total Volume: ${scopeAreas.reduce((sum: number, a: any) => sum + a.length * a.width * a.height, 0).toFixed(1)} m³` : ""}

### ENVIRONMENTAL CONDITIONS
${psychrometricAssessment.waterClass ? `- Water Class: Class ${psychrometricAssessment.waterClass} (IICRC Standard)` : ""}
${psychrometricAssessment.temperature ? `- Temperature: ${psychrometricAssessment.temperature}°C (Ambient)` : ""}
${psychrometricAssessment.humidity ? `- Humidity: ${psychrometricAssessment.humidity}% (Relative)` : ""}
${psychrometricAssessment.systemType ? `- System Type: ${psychrometricAssessment.systemType} (Ventilation)` : ""}

${
  psychrometricAssessment.dryingPotential?.recommendation
    ? `### DRYING STRATEGY ANALYSIS
${psychrometricAssessment.dryingPotential.recommendation}`
    : ""
}

### DRYING POTENTIAL REFERENCE GUIDE
- 0-30 (POOR): Air saturated or cold. Minimal evaporation. Action: Increase heat or dehumidification.
- 30-50 (FAIR): Slow evaporation. Action: Add air movement and monitor closely.
- 50-80 (GOOD): Optimal range. Action: Maintain current setup.
- 80+ (EXCELLENT): Rapid evaporation. Action: Watch for over-drying.


${
  equipmentSelection && equipmentSelection.length > 0
    ? `### EQUIPMENT LOADOUT SCHEDULE
${equipmentSelection.reduce((sum: number, sel: any) => sum + sel.quantity, 0)} Total Units

${equipmentSelection
  .map((sel: any) => {
    const group = getEquipmentGroupById(sel.groupId);
    const type = group?.id.includes("lgr")
      ? "LGR DEHUMIDIFIER"
      : group?.id.includes("desiccant")
        ? "DESICCANT DEHUMIDIFIER"
        : group?.id.includes("airmover")
          ? "AIR MOVER"
          : group?.id.includes("heat")
            ? "HEAT DRYING"
            : "EQUIPMENT";
    const dailyRate = sel.dailyRate || 0;
    const itemDailyTotal = dailyRate * sel.quantity;
    const itemTotalCost =
      itemDailyTotal * (report.estimatedDryingDuration || 1);
    return `- ${group?.name || sel.groupId} (${type}): ${sel.quantity} units × $${dailyRate.toFixed(2)}/day = $${itemDailyTotal.toFixed(2)}/day (Total: $${itemTotalCost.toFixed(2)})`;
  })
  .join("\n")}

${
  report.estimatedDryingDuration ||
  report.equipmentCostTotal ||
  totalAmpsNumber > 0
    ? `**Estimated Consumption:**
${report.estimatedDryingDuration ? `- Duration: ${report.estimatedDryingDuration} Days` : ""}
${report.equipmentCostTotal ? `- Total Equipment Cost: $${report.equipmentCostTotal.toFixed(2)}` : ""}
${totalAmpsNumber > 0 ? `- Total Electrical Draw: ${totalAmpsNumber.toFixed(1)} Amps` : ""}`
    : ""
}
`
    : ""
}

### REPORT CERTIFICATION
This report has been generated using the AuRestor Proprietary Psychrometric Engine. All calculations comply with ANSI/IICRC S500 Standards for Professional Water Damage Restoration.

Generated by AuRestor Industries
© ${new Date().getFullYear()} AuRestor Industries. All rights reserved.
`
    : "Psychrometric assessment data not available. Include standard IICRC S500 psychrometric assessment based on available data."
}

## SECTION 4: AREAS AFFECTED
Detailed room-by-room breakdown with:
- Affected materials
- Visible damage description
- Water depth estimate (if known)
- Progression observed

## SECTION 5: STANDARDS COMPLIANCE FRAMEWORK
### Subsection A: IICRC Water Damage Standards
### Subsection B: Building Code Compliance (use state-specific building code)
### Subsection C: Work Health and Safety (use state-specific WHS Act)
### Subsection D: Environmental Protection (use state-specific EPA Act)
### Subsection E: Local Council Requirements (if postcode available)

## SECTION 6: HAZARD ASSESSMENT FLAGS
${
  hasHazards
    ? `For EACH hazard identified, create a STOP WORK FLAG block with:
- 🚩 STOP WORK FLAG: [Hazard Name]
- Description
- IICRC/WHS Requirement
- Specialist Referral
- Notification Required (use state-specific authorities)
- Cost Impact
- Timeline Impact`
    : "No hazards identified - this section can be brief or omitted."
}

## SECTION 7: INITIAL REMEDIATION ACTIONS COMPLETED
- Standing Water Extraction
${
  equipmentSelection && equipmentSelection.length > 0
    ? `- Equipment Deployed: ${equipmentSelection
        .map((sel: any) => {
          const group = getEquipmentGroupById(sel.groupId);
          return `${sel.quantity}x ${group?.name || sel.groupId}`;
        })
        .join(", ")}`
    : equipmentDeployed
      ? `- Equipment Deployed: ${equipmentDeployed}`
      : "- Equipment Deployed: (To be specified)"
}
- Moisture Assessment
- Initial PPE & Safety

## SECTION 8: DRYING PROTOCOL AND METHODOLOGY
For each material type identified, provide specific protocols:
${materials.includes("Yellow tongue particleboard") ? "- Yellow Tongue Particleboard Subfloor (Class 3/4 drying) - IICRC S500 Section 5.2" : ""}
${materials.includes("Floating timber floors") ? "- Floating Timber Floors (Class 2/3) - IICRC S500 Section 5.1" : ""}
${materials.includes("Carpet on concrete slab") ? "- Carpet on Concrete Slab (Class 1) - IICRC S500 Section 4.2" : ""}
${materials.some((m: string) => m.includes("Plasterboard")) ? "- Plasterboard Walls & Ceilings - IICRC S500 Section 5.3" : ""}

## SECTION 9: OCCUPANCY AND SAFETY CONSIDERATIONS
${isOccupied ? "Include: Access Restrictions, Air Quality, Utilities, Pet/Children Safety" : ""}
${hasVulnerablePersons ? "Include: Respiratory Health, Mobility, Medical Equipment" : ""}
${petsPresent ? "Include: Dogs/Cats, Exotic Animals, Pest Activity considerations" : ""}
${occupancyStatus && occupancyStatus.includes("Vacant") ? "Include: Security, Timeline Flexibility, Utility Access" : ""}

## SECTION 10: SECONDARY DAMAGE AND MOULD RISK
- Mould Growth Risk Assessment (based on water duration)
- Preventative Measures
- If Active Mould Detected (protocol)
- Occupant Health Considerations

## SECTION 11: POWER AND EQUIPMENT REQUIREMENTS
${
  equipmentSelection && equipmentSelection.length > 0
    ? `- Power Draw Calculation: ${totalAmpsNumber.toFixed(1)} Amps total (calculated from selected equipment)
- Equipment Load: ${equipmentSelection
        .map((sel: any) => {
          const group = getEquipmentGroupById(sel.groupId);
          return `${sel.quantity}x ${group?.name || sel.groupId} (${(group?.amps || 0) * sel.quantity}A)`;
        })
        .join(", ")}
- Total Daily Equipment Cost: $${equipmentSelection
        .reduce((sum: number, sel: any) => {
          const dailyRate = sel.dailyRate || 0;
          return sum + dailyRate * sel.quantity;
        }, 0)
        .toFixed(2)}`
    : "- Power Draw Calculation: (calculate from equipment deployed)"
}
- Context and recommendations
- Alternative options if needed

## SECTION 12: THINGS TO CONSIDER
- Insurance Coverage
- Timeframe Expectations
- Occupant Communication
- Building Certifier (use state-specific building authority)
- Temporary Accommodation
- Contents Replacement

## SECTION 13: AUTHORITY NOTIFICATION CHECKLIST
${
  stateInfo
    ? `Use state-specific authorities:
- ${stateInfo.workSafetyAuthority} - Contact: ${stateInfo.workSafetyContact}
- ${stateInfo.epaAuthority} - Contact: ${stateInfo.epaContact}
- Local Council Building Certifier
- Insurance Company
- ${stateInfo.buildingAuthority} (if structural repairs required)`
    : "Use generic Australian authorities"
}

## SECTION 14: RECOMMENDATIONS AND NEXT STEPS
- Immediate (Day 0–1)
- Short-term (Days 1–7)
- If Class 4 Drying Required
- If Specialist Referrals Triggered
- Final Validation

## SIGNATURE
${
  report.technicianName
    ? `At the end of the report, include a signature section. Format it as plain text (NO HTML TAGS, NO <br>, NO <p> tags) with the following information, each on a separate line:

${report.technicianName}
Water Damage Restoration Technician
RestoreAssist
${new Date().toLocaleDateString("en-AU")}

CRITICAL: Do NOT use HTML tags like <p>, <br>, or style attributes. Use plain text with line breaks. The signature should appear at the bottom of the report.`
    : `At the end of the report, include a signature section with the date: ${new Date().toLocaleDateString("en-AU")}. Use plain text only, NO HTML tags.`
}

# CRITICAL REQUIREMENTS

1. **MARKDOWN FORMATTING IS MANDATORY**: You MUST use proper Markdown heading syntax:
   - Use single hash (#) followed by space for the main title "PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE"
   - Use double hash (##) followed by space for all major section headers like "## SECTION 1: EXECUTIVE SUMMARY"
   - Use triple hash (###) followed by space for all subsection headers like "### KEY PERFORMANCE METRICS"
   - Do NOT use plain text for section titles - they must have markdown heading syntax
   - **CRITICAL: NEVER use HTML tags like <p>, <br>, <div>, or style attributes anywhere in the report. Use plain text and markdown only.**
2. Use state-specific regulatory information provided (${stateInfo ? stateInfo.name : "generic Australian"})
3. Reference IICRC S500:2025 and S520 standards explicitly
4. Reference ${stateInfo ? stateInfo.buildingCode : "NCC"} explicitly
5. Reference ${stateInfo ? stateInfo.whsAct : "Work Health and Safety Act 2011"} explicitly
6. Use ONLY the actual data provided in the REPORT DATA section - do not make up information
7. Do NOT include any placeholder text like "Not provided", "Not specified", "N/A", or "Unknown"
8. Only include sections and fields for which actual data was provided
9. Include all required subsections
10. Use Australian English spelling
11. Make it comprehensive and professional

Generate the complete report now.`;
}

function buildVisualCentricReportPrompt(data: {
  report: any;
  analysis: any;
  tier1: any;
  tier2: any;
  tier3: any;
  stateInfo: any;
  standardsContext?: string;
  psychrometricAssessment?: any;
  scopeAreas?: any[];
  equipmentSelection?: any[];
  waterCategory: string | null;
  materials: string[];
  affectedAreas: string | null;
  moistureReadings: any;
  equipmentDeployed: string | null;
  roomsAffectedCount: number;
  materialsList: string;
  avgMoisture: number | null;
  totalEquipmentUnits: number;
  totalLitresExtracted: number | null;
  dryingIndex: number | null;
  dryingStatus: string | null;
  totalAmpsNumber: number;
  hazards: string[];
  hasHazards: boolean;
  occupancyStatus: string | null;
  isOccupied: boolean;
  hasVulnerablePersons: boolean;
  petsPresent: string | null;
  waterDuration: string | null;
  waterMigration: string | null;
  affectedContents: string | null;
  structuralConcerns: string[];
  buildingServices: string[];
  insuranceConsiderations: string | null;
  timelineRequirements: string | null;
  dryingPreferences: string | null;
  chemicalTreatment: string | null;
  totalAffectedArea: string | null;
  class4Drying: string | null;
  estimatedDryingDuration?: number | null;
  equipmentCostTotal?: number | null;
}): string {
  const {
    report,
    tier1,
    tier2,
    tier3,
    stateInfo,
    psychrometricAssessment,
    scopeAreas,
    equipmentSelection,
    waterCategory,
    materials,
    affectedAreas,
    roomsAffectedCount,
    materialsList,
    avgMoisture,
    totalEquipmentUnits,
    totalLitresExtracted,
    dryingIndex,
    dryingStatus,
    totalAmpsNumber,
    hasHazards,
    isOccupied,
    hasVulnerablePersons,
    petsPresent,
    estimatedDryingDuration,
    equipmentCostTotal,
    waterMigration,
    hazards,
    occupancyStatus,
    waterDuration,
    affectedContents,
    structuralConcerns,
    buildingServices,
    insuranceConsiderations,
    timelineRequirements,
    dryingPreferences,
    chemicalTreatment,
    totalAffectedArea,
    class4Drying,
  } = data;

  const estimatedDays =
    estimatedDryingDuration || report.estimatedDryingDuration || 4;
  const totalCost = equipmentCostTotal || report.equipmentCostTotal || 0;

  return `Generate a VISUAL-CENTRIC Water Damage Restoration Overview Report for RestoreAssist. This report should be highly visual, using icons, gauges, charts, and visual representations to present information at a glance.

# REPORT DATA

## Cover Page Information
- Report Title: Water Damage Restoration Overview
- Claim Reference: ${report.claimReferenceNumber || report.reportNumber || "N/A"}
- Property Address: ${report.propertyAddress}
${report.propertyPostcode ? `- Postcode: ${report.propertyPostcode}` : ""}
- Client Name: ${report.clientName}
- Date Generated: ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}
${report.technicianName ? `- Technician: ${report.technicianName}` : ""}

## Incident Summary
${tier1?.T1_Q3_waterSource || report.sourceOfWater ? `- Water Source: ${tier1?.T1_Q3_waterSource || report.sourceOfWater}` : ""}
${waterCategory ? `- Water Category: ${waterCategory}` : ""}
${report.incidentDate ? `- Date of Loss: ${new Date(report.incidentDate).toLocaleDateString("en-AU")}` : ""}
${report.technicianAttendanceDate ? `- Technician Attendance: ${new Date(report.technicianAttendanceDate).toLocaleDateString("en-AU")}` : ""}

## Visual Metrics
- Rooms Affected: ${roomsAffectedCount}
- Materials Affected: ${materialsList}
- Average Moisture: ${avgMoisture ? `${avgMoisture.toFixed(0)}%` : "N/A"}
- Total Equipment Units: ${totalEquipmentUnits}
- Total Litres Extracted: ${totalLitresExtracted ? `${totalLitresExtracted} L` : "N/A"}
- Drying Index: ${dryingIndex || "N/A"}
- Drying Status: ${dryingStatus || "N/A"}
- Estimated Duration: ${estimatedDays} Days
- Total Equipment Cost: $${totalCost?.toFixed(2) || "0.00"}

${
  equipmentSelection && equipmentSelection.length > 0
    ? `## Equipment Breakdown
${equipmentSelection
  .map((sel: any) => {
    const group = getEquipmentGroupById(sel.groupId);
    const dailyRate = sel.dailyRate || 0;
    const itemDailyTotal = dailyRate * sel.quantity;
    const itemTotalCost = itemDailyTotal * estimatedDays;
    return `- ${group?.name || sel.groupId}: ${sel.quantity} units × $${dailyRate.toFixed(2)}/day = $${itemDailyTotal.toFixed(2)}/day (Total: $${itemTotalCost.toFixed(2)})`;
  })
  .join("\n")}`
    : ""
}

${
  scopeAreas && scopeAreas.length > 0
    ? `## Room Details
${scopeAreas
  .map(
    (area: any, idx: number) => `
Room ${idx + 1}: ${area.name}
- Material: ${materials[idx] || "Various"}
- Moisture: ${avgMoisture ? `${avgMoisture.toFixed(0)}%` : "N/A"} - Target: 12%
- Status: Saturated
- Dimensions: ${area.length}m × ${area.width}m × ${area.height}m
- Wet Area: ${(area.length * area.width * (area.wetPercentage / 100)).toFixed(1)} m²
`,
  )
  .join("\n")}`
    : ""
}

# VISUAL REPORT STRUCTURE

Generate a visual-centric report matching the RestoreAssist dashboard style. Use this EXACT structure:

# RestoreAssist Water Damage Restoration Overview

## Header Section

**Restore Assist** | **Water Damage Restoration Overview**

**Job Ref:** ${report.claimReferenceNumber || report.reportNumber || "INS-2025-001234"}  
**Date:** ${new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" })}  
**Occupancy:** ${isOccupied ? "Occupied" : "Vacant"}${hasVulnerablePersons || petsPresent ? ` (${hasVulnerablePersons ? "2 Children" : ""}${petsPresent ? petsPresent : ""})` : ""}

---

## Overview Metrics Cards

Create visual summary cards in a grid layout:

**🏠 Rooms Affected:** ${roomsAffectedCount}  
**🧱 Materials Affected:** ${materialsList}  
**💧 Moisture Level:** Avg. ${avgMoisture ? `${avgMoisture.toFixed(0)}%` : "32%"}  
**💰 Total Cost:** $${totalCost?.toFixed(2) || "2,320"}  

**📈 Drying Status:** ${dryingStatus || "Fair"}  
**💧 Total Litres Extracted:** ${totalLitresExtracted ? `${totalLitresExtracted} L` : "80-100 L"}  
**📅 Estimated Duration:** ${estimatedDays} Days  
**🌡️ Drying Index:** ${dryingIndex || "33.6"}  

**🚦 Safety Traffic Light:** ${isOccupied ? "🟠 Occupied" : "🟢 Vacant"}${hasVulnerablePersons || petsPresent ? " + Children" : ""}  
**💧 Category of Water:** ${waterCategory || "1"}

---

## STATE COMPLIANCE & STANDARDS

${
  stateInfo
    ? `
- Work Health and Safety Act ${stateInfo.whsAct ? stateInfo.whsAct.split(" ").pop() : "2011"}
- ${stateInfo.epaAct || "Environmental Protection Act 1994"}
- ${stateInfo.buildingCode || "Queensland Development Code"}
- Standards Applied
- ANSI/IICRC S500:2025
`
    : `
- Work Health and Safety Act 2011
- Environmental Protection Act 1994
- Queensland Development Code
- Standards Applied
- ANSI/IICRC S500:2025
`
}

---

## Room-Specific Details

${
  scopeAreas && scopeAreas.length > 0
    ? scopeAreas
        .map((area: any, idx: number) => {
          const roomMaterials =
            materials[idx] || (materials.length > 0 ? materials[0] : "Various");
          const roomMoisture = avgMoisture ? avgMoisture.toFixed(0) : "32";
          const targetMoisture = "12";
          const isSaturated = parseFloat(roomMoisture) > 20;
          const roomEquipment =
            equipmentSelection && equipmentSelection.length > 0
              ? equipmentSelection
                  .filter((sel: any) => {
                    const group = getEquipmentGroupById(sel.groupId);
                    return (
                      group?.id.includes("airmover") ||
                      group?.id.includes("lgr") ||
                      group?.id.includes("desiccant")
                    );
                  })
                  .map((sel: any) => {
                    const group = getEquipmentGroupById(sel.groupId);
                    const isAirMover = group?.id.includes("airmover");
                    const isLGR = group?.id.includes("lgr");
                    return isAirMover
                      ? `Air Mover (x${sel.quantity})`
                      : isLGR
                        ? `LGR Dehumidifier`
                        : `${group?.name || sel.groupId}`;
                  })
                  .join(", ")
              : "Air Mover, LGR Dehumidifier";

          return `
### ${area.name || `Room ${idx + 1}`}

**Materials:** ${roomMaterials}  
**Moisture:** ${roomMoisture}%${isSaturated ? ` - Target: ${targetMoisture}%` : ""}  
**Current moisture:** ${isSaturated ? "Saturated" : parseFloat(roomMoisture) > 15 ? "Fair" : "Good"}  
**Scope of work:** Extract water & apply antimicrobial  
**Equipment:** ${roomEquipment}
`;
        })
        .join("\n\n")
    : affectedAreas
      ? `
### Affected Rooms

${
  Array.isArray(affectedAreas)
    ? affectedAreas
        .map(
          (room: string, idx: number) => `
**${room}**
- **Materials:** ${materials[idx] || materialsList}
- **Moisture:** ${avgMoisture ? `${avgMoisture.toFixed(0)}%` : "32%"} - Target: 12%
- **Status:** Saturated
- **Scope:** Extract water & apply antimicrobial
`,
        )
        .join("\n")
    : `
**${affectedAreas}**
- **Materials:** ${materialsList}
- **Moisture:** ${avgMoisture ? `${avgMoisture.toFixed(0)}%` : "32%"} - Target: 12%
- **Status:** Saturated
- **Scope:** Extract water & apply antimicrobial
`
}
`
      : ""
}

---

## Overall Status / Warning Panel

**Drying Status Gauge:** ${dryingIndex || "33.6"} - **${dryingStatus ? dryingStatus.toUpperCase() : "FAIR"}**

${
  isOccupied && (hasVulnerablePersons || petsPresent)
    ? `
**⚠️ Amber Warning:** Occupied: ${hasVulnerablePersons ? "Children Present" : petsPresent || "Special Considerations"}
`
    : ""
}

---

## 🔧 Equipment Deployment

**${totalEquipmentUnits} Drying Units Deployed**

${
  equipmentSelection && equipmentSelection.length > 0
    ? equipmentSelection
        .map((sel: any) => {
          const group = getEquipmentGroupById(sel.groupId);
          const isDehumidifier =
            group?.id.includes("lgr") || group?.id.includes("desiccant");
          const isAirMover = group?.id.includes("airmover");
          return `- ${isDehumidifier ? "💨" : isAirMover ? "🌀" : "⚙️"} ${group?.name || sel.groupId}: **${sel.quantity}** units`;
        })
        .join("\n")
    : ""
}

**Includes:** Industrial-grade dehumidifiers and high-volume air movers

---

## ⏱️ Estimated Timeline

**${estimatedDays}-Day Estimated Drying Time**

This timeframe is based on the current equipment loadout and site conditions.

---

## COST & FORECAST

### Equipment Cost Breakdown (${estimatedDays} Days)

| QTY | RATE/DAY | TOTAL |
|-----|----------|-------|
${
  equipmentSelection && equipmentSelection.length > 0
    ? (() => {
        const dehumidifiers = equipmentSelection.filter((sel: any) => {
          const group = getEquipmentGroupById(sel.groupId);
          return group?.id.includes("lgr") || group?.id.includes("desiccant");
        });
        const airMovers = equipmentSelection.filter((sel: any) => {
          const group = getEquipmentGroupById(sel.groupId);
          return group?.id.includes("airmover");
        });

        let rows: string[] = [];

        if (dehumidifiers.length > 0) {
          const totalQty = dehumidifiers.reduce(
            (sum: number, sel: any) => sum + sel.quantity,
            0,
          );
          const totalDailyRate = dehumidifiers.reduce(
            (sum: number, sel: any) => {
              const group = getEquipmentGroupById(sel.groupId);
              const dailyRate = sel.dailyRate || 0;
              return sum + dailyRate * sel.quantity;
            },
            0,
          );
          const totalCost = totalDailyRate * estimatedDays;
          rows.push(
            `| LGR (${totalQty}) | $${totalDailyRate.toFixed(2)} | $${totalCost.toFixed(2)} |`,
          );
        }

        if (airMovers.length > 0) {
          const totalQty = airMovers.reduce(
            (sum: number, sel: any) => sum + sel.quantity,
            0,
          );
          const totalDailyRate = airMovers.reduce((sum: number, sel: any) => {
            const group = getEquipmentGroupById(sel.groupId);
            const dailyRate = sel.dailyRate || 0;
            return sum + dailyRate * sel.quantity;
          }, 0);
          const totalCost = totalDailyRate * estimatedDays;
          rows.push(
            `| Air (${totalQty}) | $${totalDailyRate.toFixed(2)} | $${totalCost.toFixed(2)} |`,
          );
        }

        if (rows.length === 0) {
          rows.push("| Equipment | $0.00 | $0.00 |");
        }

        return rows.join("\n");
      })()
    : "| Equipment | $0.00 | $0.00 |"
}

**Total reserve:** ${estimatedDays} days

---

## Incident Details

${tier1?.T1_Q3_waterSource || report.sourceOfWater ? `**Water Source:** ${tier1?.T1_Q3_waterSource || report.sourceOfWater}` : ""}  
${waterCategory ? `**Water Category:** ${waterCategory}` : ""}  
${report.incidentDate ? `**Date of Loss:** ${new Date(report.incidentDate).toLocaleDateString("en-AU")}` : ""}  
${report.technicianAttendanceDate ? `**Technician Attendance:** ${new Date(report.technicianAttendanceDate).toLocaleDateString("en-AU")}` : ""}

${waterMigration ? `**Water Migration Pattern:** ${waterMigration}` : ""}

---

## Key Actions & Notes

✅ Water extraction completed  
✅ Moisture assessment performed  
✅ Equipment deployed  
✅ Initial safety measures implemented

${hasHazards && hazards ? `⚠️ **Hazards Identified:** ${hazards.join(", ")}` : ""}

---

**Report generated by RestoreAssist v1.0**  
**Generated:** ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}  
${report.technicianName ? `**Technician:** ${report.technicianName}` : ""}

---

# CRITICAL FORMATTING REQUIREMENTS

1. **EXACT STRUCTURE:** Follow the structure above EXACTLY - Header, Overview Cards, State Compliance, Room Details, Status Panel, Cost & Forecast, Incident Details, Footer
2. **Visual Cards Layout:** Present overview metrics as visual cards with icons (🏠, 💧, 📊, 💰, etc.)
3. **Room Panels:** Each room should have its own section with Materials, Moisture (current and target), Status, Scope of work, and Equipment listed
4. **State Compliance Section:** List compliance standards as bullet points (Work Health and Safety Act, EPA Act, Building Code, IICRC Standards)
5. **Status Gauge:** Show drying status as a gauge value (e.g., "33.6 - FAIR") with clear status label
6. **Cost Table:** Use a simple 3-column table (QTY | RATE/DAY | TOTAL) grouping equipment by type (LGR Dehumidifiers, Air Movers)
7. **Warning Boxes:** Use amber warning boxes for occupied properties with children/vulnerable persons
8. **Visual Separators:** Use horizontal rules (---) to separate major sections
9. **NO HTML TAGS:** Use only markdown formatting, no <p>, <br>, <div>, or style attributes
10. **Dashboard Style:** Make it look like a professional dashboard with clear sections, cards, and visual hierarchy
11. **Use actual data only:** Only include information from the REPORT DATA section above
12. **Footer:** Include "Report generated by RestoreAssist v1.0" at the bottom

Generate the complete visual-centric dashboard-style report now, matching the structure and format shown above.`;
}

function buildStructuredBasicReport(data: {
  report: any;
  analysis: any;
  stateInfo: any;
  psychrometricAssessment?: any;
  scopeAreas?: any[];
  equipmentSelection?: any[];
  inspectionData?: any;
  tier1?: any;
  tier2?: any;
  tier3?: any;
  businessInfo?: {
    businessName?: string | null;
    businessAddress?: string | null;
    businessLogo?: string | null;
    businessABN?: string | null;
    businessPhone?: string | null;
    businessEmail?: string | null;
  };
}): any {
  const {
    report,
    analysis,
    stateInfo,
    psychrometricAssessment,
    scopeAreas,
    equipmentSelection,
    inspectionData,
    tier1,
    tier2,
    tier3,
    businessInfo,
  } = data;

  // Extract photos from inspection data - ensure we get ALL photos
  const photos: Array<{
    url: string;
    thumbnailUrl?: string;
    location?: string;
    caption?: string;
    category?: string;
  }> = [];

  // Priority 1: Photos from NIR data (inspectionData)
  if (inspectionData?.photos && Array.isArray(inspectionData.photos)) {
    inspectionData.photos.forEach((photo: any) => {
      // Handle both object format {url, thumbnailUrl, ...} and string format
      if (photo.url || (typeof photo === "string" && photo)) {
        const photoUrl = photo.url || photo;
        if (photoUrl) {
          photos.push({
            url: photoUrl,
            thumbnailUrl: photo.thumbnailUrl || photoUrl, // Use main URL as fallback
            location: photo.location || null,
            caption: photo.caption || photo.location || null,
            category: photo.category || photo.location || null, // Category stored as location or in category field
          });
        }
      }
    });
  }

  // Priority 2: Photos from analysis (PDF upload)
  if (analysis?.photos && Array.isArray(analysis.photos)) {
    analysis.photos.forEach((photo: any) => {
      if (photo.url || (typeof photo === "string" && photo)) {
        const photoUrl = photo.url || photo;
        if (photoUrl && !photos.find((p) => p.url === photoUrl)) {
          photos.push({
            url: photoUrl,
            thumbnailUrl: photo.thumbnailUrl || photoUrl,
            location: photo.location || null,
            caption: photo.caption || photo.location || null,
            category: photo.category || photo.location || null,
          });
        }
      }
    });
  }

  // Also check if photos are stored in report directly (legacy support)
  if (photos.length === 0 && report.photos) {
    try {
      const reportPhotos =
        typeof report.photos === "string"
          ? JSON.parse(report.photos)
          : report.photos;
      if (Array.isArray(reportPhotos)) {
        reportPhotos.forEach((photo: any) => {
          if (photo.url || photo.secure_url) {
            photos.push({
              url: photo.url || photo.secure_url,
              thumbnailUrl: photo.thumbnailUrl || photo.url || photo.secure_url,
              location: photo.location || null,
              caption: photo.caption || photo.location || null,
              category: photo.category || photo.location || null,
            });
          }
        });
      }
    } catch (e) {
      // Not JSON, skip
    }
  }

  // Extract affected areas - PRIORITIZE scopeAreas (room management) from equipment selection
  const affectedAreasList: Array<{
    name: string;
    description: string;
    materials: string[];
    moistureReadings: Array<{ location: string; value: number; unit: string }>;
    photos: string[];
    dimensions?: { length: number; width: number; height: number };
    wetPercentage?: number;
    volume?: number;
    wetArea?: number;
  }> = [];

  // First priority: Use scopeAreas (room management) from equipment selection
  if (scopeAreas && Array.isArray(scopeAreas) && scopeAreas.length > 0) {
    scopeAreas.forEach((area: any) => {
      const volume =
        (area.length || 0) * (area.width || 0) * (area.height || 0);
      const wetArea =
        (area.length || 0) *
        (area.width || 0) *
        ((area.wetPercentage || 0) / 100);

      // Match photos by area name
      let areaPhotos: string[] = [];
      if (area.name && photos.length > 0) {
        // Try to match photos by location/name
        const matchedPhotos = photos.filter(
          (p) =>
            p.location &&
            area.name &&
            (p.location.toLowerCase().includes(area.name.toLowerCase()) ||
              area.name.toLowerCase().includes(p.location.toLowerCase())),
        );
        areaPhotos = matchedPhotos.map((p) => p.url);
      }

      // If no photos matched, include photos without location or all photos
      if (areaPhotos.length === 0 && photos.length > 0) {
        const photosWithoutLocation = photos
          .filter((p) => !p.location)
          .map((p) => p.url);
        areaPhotos =
          photosWithoutLocation.length > 0
            ? photosWithoutLocation
            : photos.map((p) => p.url);
      }

      // Get moisture readings for this area
      let areaMoistureReadings: Array<{
        location: string;
        value: number;
        unit: string;
      }> = [];
      if (
        inspectionData?.moistureReadings &&
        Array.isArray(inspectionData.moistureReadings)
      ) {
        if (area.name) {
          areaMoistureReadings = inspectionData.moistureReadings
            .filter((r: any) => {
              if (!r.location) return false;
              const rLoc = r.location.toLowerCase();
              const areaName = area.name.toLowerCase();
              return rLoc.includes(areaName) || areaName.includes(rLoc);
            })
            .map((r: any) => ({
              location: r.location || area.name || "Unknown",
              value: r.moistureLevel || 0,
              unit: "%",
            }));
        }

        // If no readings matched, use all readings
        if (areaMoistureReadings.length === 0) {
          areaMoistureReadings = inspectionData.moistureReadings.map(
            (r: any) => ({
              location: r.location || area.name || "Unknown",
              value: r.moistureLevel || 0,
              unit: "%",
            }),
          );
        }
      }

      affectedAreasList.push({
        name: area.name || `Area ${affectedAreasList.length + 1}`,
        description: `Dimensions: ${area.length || 0}m × ${area.width || 0}m × ${area.height || 0}m, Wet: ${area.wetPercentage || 0}%`,
        materials: [],
        moistureReadings: areaMoistureReadings,
        photos: areaPhotos,
        dimensions: {
          length: area.length || 0,
          width: area.width || 0,
          height: area.height || 0,
        },
        wetPercentage: area.wetPercentage || 0,
        volume: volume,
        wetArea: wetArea,
      });
    });
  }

  // Second priority: Use inspectionData affectedAreas if scopeAreas not available
  if (
    affectedAreasList.length === 0 &&
    inspectionData?.affectedAreas &&
    Array.isArray(inspectionData.affectedAreas)
  ) {
    inspectionData.affectedAreas.forEach((area: any) => {
      // Match photos by location or roomZoneId - be more flexible
      let areaPhotos: string[] = [];

      if (area.roomZoneId) {
        // Try exact match first
        areaPhotos = photos
          .filter(
            (p) =>
              p.location &&
              area.roomZoneId &&
              (p.location.toLowerCase() === area.roomZoneId.toLowerCase() ||
                p.location
                  .toLowerCase()
                  .includes(area.roomZoneId.toLowerCase()) ||
                area.roomZoneId
                  .toLowerCase()
                  .includes(p.location.toLowerCase())),
          )
          .map((p) => p.url);
      }

      // If no photos matched by location, try to match by area name
      if (areaPhotos.length === 0 && area.name) {
        areaPhotos = photos
          .filter(
            (p) =>
              p.location &&
              area.name &&
              (p.location.toLowerCase().includes(area.name.toLowerCase()) ||
                area.name.toLowerCase().includes(p.location.toLowerCase())),
          )
          .map((p) => p.url);
      }

      // If still no photos, include photos without location or all photos
      if (areaPhotos.length === 0) {
        const photosWithoutLocation = photos
          .filter((p) => !p.location)
          .map((p) => p.url);
        areaPhotos =
          photosWithoutLocation.length > 0
            ? photosWithoutLocation
            : photos.map((p) => p.url);
      }

      // Get moisture readings for this area - be more flexible
      let areaMoistureReadings: Array<{
        location: string;
        value: number;
        unit: string;
      }> = [];

      if (
        inspectionData.moistureReadings &&
        Array.isArray(inspectionData.moistureReadings)
      ) {
        if (area.roomZoneId) {
          areaMoistureReadings = inspectionData.moistureReadings
            .filter((r: any) => {
              if (!r.location) return false;
              const rLoc = r.location.toLowerCase();
              const areaId = area.roomZoneId.toLowerCase();
              return rLoc.includes(areaId) || areaId.includes(rLoc);
            })
            .map((r: any) => ({
              location: r.location || area.roomZoneId || "Unknown",
              value: r.moistureLevel || 0,
              unit: "%",
            }));
        }

        // If no readings matched, use all readings
        if (areaMoistureReadings.length === 0) {
          areaMoistureReadings = inspectionData.moistureReadings.map(
            (r: any) => ({
              location: r.location || area.roomZoneId || area.name || "Unknown",
              value: r.moistureLevel || 0,
              unit: "%",
            }),
          );
        }
      }

      affectedAreasList.push({
        name:
          area.roomZoneId ||
          area.name ||
          `Area ${affectedAreasList.length + 1}`,
        description: area.description || "",
        materials: [],
        moistureReadings: areaMoistureReadings,
        photos: areaPhotos,
      });
    });
  }

  // Third priority: Create areas from moisture readings if no other data
  if (affectedAreasList.length === 0) {
    // Create area from moisture readings
    if (
      inspectionData?.moistureReadings &&
      inspectionData.moistureReadings.length > 0
    ) {
      const uniqueLocations = [
        ...new Set(
          inspectionData.moistureReadings
            .map((r: any) => r.location)
            .filter(Boolean),
        ),
      ];
      if (uniqueLocations.length > 0) {
        (uniqueLocations as string[]).forEach((location: string) => {
          const locationReadings = inspectionData.moistureReadings.filter(
            (r: any) => r.location === location,
          );
          const locationPhotos = photos
            .filter((p) => p.location === location)
            .map((p) => p.url);

          affectedAreasList.push({
            name: location || "Affected Area",
            description: "",
            materials: [],
            moistureReadings: locationReadings.map((r: any) => ({
              location: r.location || "Unknown",
              value: r.moistureLevel || 0,
              unit: "%",
            })),
            photos:
              locationPhotos.length > 0
                ? locationPhotos
                : photos.map((p) => p.url),
          });
        });
      }
    }

    // If still no areas but we have photos, create a general area
    if (affectedAreasList.length === 0 && photos.length > 0) {
      affectedAreasList.push({
        name: "Inspection Area",
        description: "General inspection area",
        materials: [],
        moistureReadings:
          inspectionData?.moistureReadings?.map((r: any) => ({
            location: r.location || "Unknown",
            value: r.moistureLevel || 0,
            unit: "%",
          })) || [],
        photos: photos.map((p) => p.url),
      });
    }
  }

  // Extract IICRC classification
  const classification = inspectionData?.classifications?.[0] || null;

  // Extract scope items
  const scopeItemsList: Array<{
    description: string;
    quantity: number;
    unit: string;
    justification?: string;
  }> = [];

  if (inspectionData?.scopeItems && Array.isArray(inspectionData.scopeItems)) {
    inspectionData.scopeItems.forEach((item: any) => {
      if (item.isSelected) {
        scopeItemsList.push({
          description: item.description || item.itemType || "",
          quantity: item.quantity || 1,
          unit: item.unit || "JOB",
          justification: item.justification || null,
        });
      }
    });
  }

  // Extract cost estimates
  const costEstimates: Array<{
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    subtotal: number;
    total: number;
  }> = [];

  if (
    inspectionData?.costEstimates &&
    Array.isArray(inspectionData.costEstimates)
  ) {
    inspectionData.costEstimates.forEach((cost: any) => {
      const quantity = Number(cost.quantity) || 1;
      const rate = Number(cost.rate) || 0;
      const subtotal = Number(cost.subtotal) || quantity * rate;
      const total = Number(cost.total) || subtotal;

      costEstimates.push({
        description: cost.description || "Cost Item",
        quantity: quantity,
        unit: cost.unit || "JOB",
        rate: rate,
        subtotal: subtotal,
        total: total,
      });
    });
  }

  // If no cost estimates but we have equipment costs, create cost estimates from equipment
  if (
    costEstimates.length === 0 &&
    equipmentSelection &&
    Array.isArray(equipmentSelection) &&
    equipmentSelection.length > 0
  ) {
    equipmentSelection.forEach((sel: any) => {
      const group = getEquipmentGroupById(sel.groupId);
      const dailyRate = Number(sel.dailyRate) || 0;
      const quantity = Number(sel.quantity) || 0;
      const duration = Number(report.estimatedDryingDuration) || 1;
      const total = dailyRate * quantity * duration;

      if (total > 0) {
        costEstimates.push({
          description: `${group?.name || sel.groupId || "Equipment"} Rental`,
          quantity: quantity,
          unit: "unit",
          rate: dailyRate,
          subtotal: dailyRate * quantity,
          total: total,
        });
      }
    });
  }

  // Calculate summary metrics
  const totalCost =
    costEstimates.length > 0
      ? costEstimates.reduce((sum, c) => sum + (Number(c.total) || 0), 0)
      : Number(report.equipmentCostTotal) || 0;
  const roomsAffected =
    affectedAreasList.length ||
    scopeAreas?.length ||
    0 ||
    analysis?.affectedAreas?.length ||
    0;
  const avgMoisture =
    inspectionData?.moistureReadings?.length > 0
      ? inspectionData.moistureReadings.reduce(
          (sum: number, r: any) => sum + (r.moistureLevel || 0),
          0,
        ) / inspectionData.moistureReadings.length
      : null;

  return {
    type: "restoration_inspection_report",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    reportDepthLevel: report.reportDepthLevel || null,
    header: {
      reportTitle: "Restoration Inspection Report",
      businessName: businessInfo?.businessName || "RestoreAssist",
      businessAddress: businessInfo?.businessAddress || null,
      businessLogo: businessInfo?.businessLogo || null,
      businessABN: businessInfo?.businessABN || null,
      businessPhone: businessInfo?.businessPhone || null,
      businessEmail: businessInfo?.businessEmail || null,
      reportNumber:
        report.reportNumber ||
        report.claimReferenceNumber ||
        `RPT-${report.id.substring(0, 8).toUpperCase()}`,
      dateGenerated: new Date().toISOString(),
    },
    property: {
      clientName: report.clientName || analysis?.clientName || null,
      clientCompany: report.client?.company || analysis?.clientCompany || null,
      propertyAddress:
        report.propertyAddress || analysis?.propertyAddress || null,
      propertyPostcode:
        report.propertyPostcode || analysis?.propertyPostcode || null,
      state: stateInfo?.name || null,
      buildingAge: report.buildingAge || analysis?.buildingAge || null,
      structureType: report.structureType || analysis?.structureType || null,
      accessNotes: report.accessNotes || analysis?.accessNotes || null,
      propertyId: report.propertyId || null,
      jobNumber: report.jobNumber || analysis?.jobNumber || null,
    },
    incident: {
      dateOfLoss: report.incidentDate
        ? new Date(report.incidentDate).toISOString()
        : analysis?.incidentDate
          ? new Date(analysis.incidentDate).toISOString()
          : null,
      technicianAttendanceDate: report.technicianAttendanceDate
        ? new Date(report.technicianAttendanceDate).toISOString()
        : analysis?.technicianAttendanceDate
          ? new Date(analysis.technicianAttendanceDate).toISOString()
          : null,
      technicianName: report.technicianName || analysis?.technicianName || null,
      claimReferenceNumber:
        report.claimReferenceNumber || analysis?.claimReferenceNumber || null,
      insurerName: report.insurerName || analysis?.insurerName || null,
      waterSource:
        analysis?.waterSource ||
        analysis?.sourceOfWater ||
        report.sourceOfWater ||
        null,
      waterCategory:
        classification?.category ||
        analysis?.waterCategory ||
        report.waterCategory ||
        null,
      waterClass:
        classification?.class ||
        analysis?.waterClass ||
        report.waterClass ||
        null,
      timeSinceLoss:
        inspectionData?.affectedAreas?.[0]?.timeSinceLoss ||
        analysis?.timeSinceLoss ||
        null,
    },
    environmental: (() => {
      const envData = inspectionData?.environmentalData;
      const psychroData = psychrometricAssessment;

      // Priority 1: Use NIR environmental data if available
      if (envData) {
        return {
          ambientTemperature: envData.ambientTemperature || null,
          humidityLevel: envData.humidityLevel || null,
          dewPoint: envData.dewPoint || null,
          airCirculation: envData.airCirculation || false,
        };
      }

      // Priority 2: Use psychrometric assessment data as fallback
      if (
        psychroData &&
        (psychroData.temperature !== null || psychroData.humidity !== null)
      ) {
        const temp = psychroData.temperature || null;
        const humidity = psychroData.humidity || null;
        const dewPoint = temp && humidity ? temp - (100 - humidity) / 5 : null;

        return {
          ambientTemperature: temp,
          humidityLevel: humidity,
          dewPoint: dewPoint ? Math.round(dewPoint * 10) / 10 : null,
          airCirculation: false, // Default to false if not specified
        };
      }

      return null;
    })(),
    psychrometric: psychrometricAssessment
      ? {
          waterClass: psychrometricAssessment.waterClass || null,
          temperature: psychrometricAssessment.temperature || null,
          humidity: psychrometricAssessment.humidity || null,
          systemType: psychrometricAssessment.systemType || null,
          dryingIndex:
            psychrometricAssessment.dryingPotential?.dryingIndex || null,
          dryingStatus: psychrometricAssessment.dryingPotential?.status || null,
          recommendation:
            psychrometricAssessment.dryingPotential?.recommendation || null,
        }
      : null,
    affectedAreas: affectedAreasList,
    moistureReadings: (() => {
      const readings: Array<{
        location: string;
        surfaceType: string | null;
        moistureLevel: number;
        depth: string | null;
        unit: string;
      }> = [];

      // Priority 1: Use NIR data moisture readings
      if (
        inspectionData?.moistureReadings &&
        Array.isArray(inspectionData.moistureReadings)
      ) {
        inspectionData.moistureReadings.forEach((r: any) => {
          readings.push({
            location: r.location || "Unknown",
            surfaceType: r.surfaceType || null,
            moistureLevel: r.moistureLevel || 0,
            depth: r.depth || null,
            unit: "%",
          });
        });
      }

      // Priority 2: Use analysis moisture readings if NIR data not available
      if (
        readings.length === 0 &&
        analysis?.moistureReadings &&
        Array.isArray(analysis.moistureReadings)
      ) {
        analysis.moistureReadings.forEach((r: any) => {
          readings.push({
            location: r.location || "Unknown",
            surfaceType: r.surfaceType || null,
            moistureLevel: r.moistureLevel || 0,
            depth: r.depth || null,
            unit: "%",
          });
        });
      }

      return readings;
    })(),
    classification: classification
      ? {
          category: classification.category || null,
          class: classification.class || null,
          justification: classification.justification || null,
          standardReference: classification.standardReference || null,
        }
      : null,
    hazards: {
      methamphetamineScreen:
        report.methamphetamineScreen || analysis?.methamphetamineScreen || null,
      methamphetamineTestCount:
        report.methamphetamineTestCount ||
        analysis?.methamphetamineTestCount ||
        null,
      biologicalMouldDetected:
        report.biologicalMouldDetected ||
        analysis?.biologicalMouldDetected ||
        false,
      biologicalMouldCategory:
        report.biologicalMouldCategory ||
        analysis?.biologicalMouldCategory ||
        null,
      asbestosRisk:
        (report.buildingAge && parseInt(report.buildingAge) < 1990) ||
        (analysis?.buildingAge && parseInt(analysis.buildingAge) < 1990)
          ? "PRE-1990_BUILDING"
          : null,
      leadRisk:
        (report.buildingAge && parseInt(report.buildingAge) < 1990) ||
        (analysis?.buildingAge && parseInt(analysis.buildingAge) < 1990)
          ? "PRE-1990_BUILDING"
          : null,
    },
    scopeItems: scopeItemsList,
    costEstimates: costEstimates,
    equipment:
      equipmentSelection && Array.isArray(equipmentSelection)
        ? equipmentSelection.map((sel: any) => {
            const group = getEquipmentGroupById(sel.groupId);
            const dailyRate = Number(sel.dailyRate) || 0;
            const quantity = Number(sel.quantity) || 0;
            const duration = Number(report.estimatedDryingDuration) || 1;
            const totalCost = dailyRate * quantity * duration;

            return {
              name: group?.name || sel.groupId || "Equipment",
              type: sel.groupId?.includes("lgr")
                ? "LGR_DEHUMIDIFIER"
                : sel.groupId?.includes("desiccant")
                  ? "DESICCANT_DEHUMIDIFIER"
                  : sel.groupId?.includes("airmover")
                    ? "AIR_MOVER"
                    : sel.groupId?.includes("heat")
                      ? "HEAT_DRYING"
                      : "OTHER",
              quantity: quantity,
              dailyRate: dailyRate,
              estimatedDuration: duration,
              totalCost: totalCost,
            };
          })
        : [],
    photos: photos,
    summary: {
      roomsAffected: roomsAffected,
      totalCost: totalCost,
      averageMoisture: avgMoisture,
      estimatedDuration: report.estimatedDryingDuration || null,
      dryingStatus: psychrometricAssessment?.dryingPotential?.status || null,
    },
    compliance: {
      standards: [
        "IICRC S500 (Water Damage Restoration)",
        "IICRC S520 (Mould Remediation)",
        stateInfo?.whsAct || "Work Health and Safety Act 2011",
        stateInfo?.epaAct || "Environmental Protection Act 1994",
        stateInfo?.buildingCode || "National Construction Code (NCC)",
        "AS/NZS 3000 (Electrical wiring rules)",
      ],
      state: stateInfo?.name || null,
      buildingAuthority: stateInfo?.buildingAuthority || null,
      workSafetyAuthority: stateInfo?.workSafetyAuthority || null,
      epaAuthority: stateInfo?.epaAuthority || null,
    },
    technicianNotes: report.technicianFieldReport || null,
    reportInstructions: report.reportInstructions || null,
    clientContactDetails: report.clientContactDetails || null,
    // Additional Contact Information
    builderDeveloper:
      report.builderDeveloperCompanyName ||
      report.builderDeveloperContact ||
      report.builderDeveloperAddress ||
      report.builderDeveloperPhone
        ? {
            companyName: report.builderDeveloperCompanyName || null,
            contact: report.builderDeveloperContact || null,
            address: report.builderDeveloperAddress || null,
            phone: report.builderDeveloperPhone || null,
          }
        : undefined,
    ownerManagement:
      report.ownerManagementContactName ||
      report.ownerManagementPhone ||
      report.ownerManagementEmail
        ? {
            contactName: report.ownerManagementContactName || null,
            phone: report.ownerManagementPhone || null,
            email: report.ownerManagementEmail || null,
          }
        : undefined,
    // Previous Maintenance & Repair History
    maintenanceHistory:
      report.lastInspectionDate ||
      report.buildingChangedSinceLastInspection ||
      report.structureChangesSinceLastInspection ||
      report.previousLeakage ||
      report.emergencyRepairPerformed
        ? {
            lastInspectionDate: report.lastInspectionDate
              ? new Date(report.lastInspectionDate).toISOString()
              : null,
            buildingChangedSinceLastInspection:
              report.buildingChangedSinceLastInspection || null,
            structureChangesSinceLastInspection:
              report.structureChangesSinceLastInspection || null,
            previousLeakage: report.previousLeakage || null,
            emergencyRepairPerformed: report.emergencyRepairPerformed || null,
          }
        : undefined,
    timeline: {
      phase1: {
        startDate: report.phase1StartDate
          ? new Date(report.phase1StartDate).toISOString()
          : null,
        endDate: report.phase1EndDate
          ? new Date(report.phase1EndDate).toISOString()
          : null,
        description: "Make-safe",
      },
      phase2: {
        startDate: report.phase2StartDate
          ? new Date(report.phase2StartDate).toISOString()
          : null,
        endDate: report.phase2EndDate
          ? new Date(report.phase2EndDate).toISOString()
          : null,
        description: "Remediation/Drying",
      },
      phase3: {
        startDate: report.phase3StartDate
          ? new Date(report.phase3StartDate).toISOString()
          : null,
        endDate: report.phase3EndDate
          ? new Date(report.phase3EndDate).toISOString()
          : null,
        description: "Verification",
      },
    },
    recommendations: [],
    verificationChecklist: null,
    // Tier data for Enhanced/Optimised reports
    tier1: tier1 || null,
    tier2: tier2 || null,
    tier3: tier3 || null,
  };
}
