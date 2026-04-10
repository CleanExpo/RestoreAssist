// Structured (non-AI) report builder extracted from generate-inspection-report route
// buildStructuredBasicReport — used for basic/enhanced reports (no AI call)

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getEquipmentGroupById } from "@/lib/equipment-matrix";

export function buildStructuredBasicReport(data: {
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
