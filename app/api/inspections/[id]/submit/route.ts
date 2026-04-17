import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyIICRC } from "@/lib/nir-classification-engine";
import {
  getBuildingCodeRequirements,
  checkBuildingCodeTriggers,
} from "@/lib/nir-building-codes";
import { determineScopeItems } from "@/lib/nir-scope-determination";
import { estimateCosts } from "@/lib/nir-cost-estimation";
import { validateTieredCompletion } from "@/lib/nir-tiered-completion";
import { checkMakeSafeGate } from "@/lib/compliance/make-safe-gate";
import { checkScopeVariationGate } from "@/lib/compliance/scope-variation-gate";
import { checkNzMoistureGate } from "@/lib/compliance/nz-moisture-gate";
import { checkSafeworkGate } from "@/lib/compliance/safework-notification-gate";
import { checkNzbsGate } from "@/lib/compliance/nzbs-compliance-gate";
import { detectMoistureTrendAnomalies } from "@/lib/compliance/moisture-trend-anomaly";

// POST - Submit inspection for processing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get inspection with all data
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        environmentalData: true,
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: true,
        photos: true,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // ── Tiered completion validation ───────────────────────────────────────────
    // CRITICAL fields block submission. SUPPLEMENTARY fields are flagged in the
    // audit log and returned to the caller but do NOT block submission.
    // This implements the field-reality spec requirement: a partial record in
    // emergency conditions is better than no record at all.
    // Source: lib/nir-field-reality-spec.ts → PHYSICAL_UX_REQUIREMENTS.tieredCompletion
    const tieredResult = validateTieredCompletion({
      propertyAddress: inspection.propertyAddress,
      propertyPostcode: inspection.propertyPostcode,
      inspectionDate: inspection.inspectionDate,
      affectedAreas: inspection.affectedAreas,
      photos: inspection.photos,
      environmentalData: inspection.environmentalData,
      moistureReadings: inspection.moistureReadings,
      scopeItems: inspection.scopeItems,
      affectedAreasWithSource: inspection.affectedAreas.map(
        (a: { waterSource?: string | null }) => ({
          waterSource: a.waterSource,
        }),
      ),
    });

    if (!tieredResult.canSubmit) {
      return NextResponse.json(
        {
          error: "Inspection cannot be submitted — critical fields missing",
          summary: tieredResult.summary,
          missingCritical: tieredResult.missingCritical.map((f) => ({
            field: f.fieldName,
            label: f.label,
            clauseRef: f.clauseRef,
            rationale: f.rationale,
          })),
        },
        { status: 400 },
      );
    }

    // ── CLAIM-003 auto-detection ────────────────────────────────────────────
    // If the inspection was previously processed (status != DRAFT), this submission
    // represents a re-inspection event. Record it automatically so no admin action
    // is needed to collect CLAIM-003 pilot data.
    const isReInspection = inspection.status !== "DRAFT";
    try {
      await prisma.pilotObservation.create({
        data: {
          claimId: "CLAIM-003",
          observationType: "reinspection_event",
          value: isReInspection ? 1 : 0, // 1 = re-inspection required, 0 = first submission
          group: "nir",
          inspectionId: id,
          recordedByUserId: session.user.id,
          context: {
            previousStatus: inspection.status,
            derivedFrom: "submit_route_auto_detection",
          },
          notes: isReInspection
            ? `Re-submission detected: inspection was previously in status ${inspection.status}`
            : "First submission — no re-inspection required",
        },
      });
    } catch (pilotError) {
      // Pilot observation failure must never block submission
      console.warn(
        "CLAIM-003 auto-detection failed (non-blocking):",
        pilotError,
      );
    }

    // ── RA-1136a: Make-Safe gate ────────────────────────────────────────────────
    // ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
    // All applicable hazard-control actions must be completed before submission.
    const makeSafeResult = await checkMakeSafeGate(id);
    if (!makeSafeResult.canSubmit) {
      return NextResponse.json(
        {
          error:
            "Stabilisation checklist incomplete — required per AS-IICRC S500:2025",
          blockers: makeSafeResult.blockers,
        },
        { status: 422 },
      );
    }

    // ── RA-1136b: Scope Variation compliance gate ──────────────────────────────
    // Block submission if any scope variations are still PENDING approval.
    // Implements ICA Code of Practice §5.
    const variationGate = await checkScopeVariationGate(id);
    if (!variationGate.canSubmit) {
      return NextResponse.json(
        {
          error: "Scope variations pending approval",
          blockers: variationGate.blockers,
        },
        { status: 422 },
      );
    }

    // ── RA-1136c: AS/NZS 4849.1 moisture advisory ──────────────────────────────
    // WARN-ONLY — does not block submission.
    const moistureResult = await checkNzMoistureGate(id);

    // ── RA-1136d: SafeWork notification trigger ─────────────────────────────────
    // WARN-ONLY — surfaces actionable regulator notifications in the response.
    const safeworkResult = await checkSafeworkGate(id);

    // ── RA-1131: Moisture trend anomaly detection ───────────────────────────────
    // WARN-ONLY — flags plateau / rising / stuck-high patterns for early warning
    // of hidden moisture sources, HVAC faults, and imminent mould risk.
    // Per IICRC S500:2025 moisture monitoring concern zone (>20% on Day 3+).
    const moistureTrendResult = await detectMoistureTrendAnomalies(id);

    // ── RA-1136e: NZBS E2/E3 compliance (NZ only) ──────────────────────────────
    // BLOCKING for NZ-jurisdiction inspections; no-op for AU (pending RA-1120).
    const nzbsGate = await checkNzbsGate(id);
    if (!nzbsGate.canSubmit) {
      return NextResponse.json(
        {
          error: "NZBS clauses not addressed",
          blockers: nzbsGate.blockers,
          requiredClauses: nzbsGate.requiredClauses,
        },
        { status: 422 },
      );
    }

    // Atomic CAS — ensures only one concurrent submit wins; prevents duplicate child record creation
    const submitGuard = await prisma.inspection.updateMany({
      where: { id, userId: session.user.id, status: "DRAFT" },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    if (submitGuard.count === 0) {
      return NextResponse.json(
        {
          error:
            "Inspection has already been submitted or is not in DRAFT state.",
        },
        { status: 409 },
      );
    }

    // Create audit log — includes supplementary field gaps for follow-up tracking
    const auditNotes = [
      "Inspection submitted for processing",
      ...(tieredResult.missingSupplementary.length > 0
        ? [
            `SUPPLEMENTARY FIELDS ABSENT: ${tieredResult.missingSupplementary.map((f) => f.label).join(", ")}`,
          ]
        : []),
      ...(tieredResult.warnings.length > 0
        ? tieredResult.warnings.map((w) => `WARNING: ${w}`)
        : []),
    ].join(" | ");

    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: auditNotes,
        entityType: "Inspection",
        entityId: id,
        userId: session.user.id,
      },
    });

    // Process classification, scope determination, and cost estimation.
    // Only run if enough data is present — supplementary gaps may limit processing.
    // In production, this should be done asynchronously via a queue.
    try {
      await processInspectionComplete(id, inspection, session.user.id);
    } catch (error) {
      console.error("Error processing inspection:", error);
      // Don't fail the submission, but log the error
      // In production, would retry via queue
    }

    // After successful submit — trigger integration sync (non-blocking)
    // Only fires if the inspection is linked to a Report (reportId is nullable).
    if (inspection.reportId) {
      try {
        const syncPayload = { reportId: inspection.reportId };
        // Fire-and-forget: don't await, don't fail the submit if sync fails
        fetch(`${process.env.NEXTAUTH_URL}/api/integrations/nir-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify(syncPayload),
        }).catch((err) =>
          console.error("[NIR Sync] Auto-trigger failed:", err),
        );
      } catch (syncErr) {
        console.error(
          "[NIR Sync] Could not trigger integration sync:",
          syncErr,
        );
      }
    }

    return NextResponse.json({
      message:
        "Inspection submitted successfully. Processing classification, scope determination, and cost estimation...",
      inspectionId: id,
      status: "SUBMITTED",
      // Surface supplementary gaps and warnings to the caller (mobile app shows follow-up prompts)
      ...(tieredResult.missingSupplementary.length > 0 && {
        missingSupplementary: tieredResult.missingSupplementary.map((f) => ({
          field: f.fieldName,
          label: f.label,
          clauseRef: f.clauseRef,
        })),
      }),
      ...(tieredResult.warnings.length > 0 && {
        warnings: tieredResult.warnings,
      }),
      // RA-1136c: AS/NZS 4849.1 moisture advisories (warn-only)
      ...(moistureResult.warnings.length > 0 && {
        moistureWarnings: moistureResult.warnings,
      }),
      // RA-1136d: SafeWork regulator notifications (warn-only)
      ...(safeworkResult.notifications.length > 0 && {
        safeworkNotifications: safeworkResult.notifications,
      }),
      // RA-1131: Moisture trend anomalies (warn-only)
      ...(moistureTrendResult.hasAnomalies && {
        moistureTrendAnomalies: moistureTrendResult.anomalies.map((a) => ({
          location: a.location,
          severity: a.severity,
          message: a.message,
        })),
      }),
    });
  } catch (error) {
    console.error("Error submitting inspection:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Process complete inspection: classification, scope determination, and cost estimation
async function processInspectionComplete(
  inspectionId: string,
  inspection: any,
  inspectionOwnerId: string,
) {
  // Update status to PROCESSING
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "PROCESSING", processedAt: new Date() },
  });

  // Step 1: Get building code requirements
  const buildingCodeRequirements = await getBuildingCodeRequirements(
    inspection.propertyPostcode,
  );

  // Step 2: Classify each affected area
  let primaryCategory = "1";
  let primaryClass = "1";
  const classifications: any[] = [];

  for (const area of inspection.affectedAreas) {
    // Get relevant moisture readings for this area
    const relevantReadings = inspection.moistureReadings.filter(
      (r: any) =>
        r.location === area.roomZoneId ||
        r.location.toLowerCase().includes(area.roomZoneId.toLowerCase()),
    );

    // Determine classification
    const classification = await classifyIICRC({
      waterSource: area.waterSource,
      affectedSquareFootage: area.affectedSquareFootage,
      moistureReadings: relevantReadings,
      environmentalData: inspection.environmentalData,
      timeSinceLoss: area.timeSinceLoss,
    });

    // Save classification
    const savedClassification = await prisma.classification.create({
      data: {
        inspectionId,
        category: classification.category,
        class: classification.class,
        justification: classification.justification,
        standardReference: classification.standardReference,
        confidence: classification.confidence,
        inputData: JSON.stringify({
          waterSource: area.waterSource,
          affectedSquareFootage: area.affectedSquareFootage,
          moistureReadings: relevantReadings,
          timeSinceLoss: area.timeSinceLoss,
        }),
        isFinal: true,
      },
    });

    classifications.push(savedClassification);

    // Update affected area with classification
    await prisma.affectedArea.update({
      where: { id: area.id },
      data: {
        category: classification.category,
        class: classification.class,
      },
    });

    // Track primary (worst) category and class
    if (parseInt(classification.category) > parseInt(primaryCategory)) {
      primaryCategory = classification.category;
    }
    if (parseInt(classification.class) > parseInt(primaryClass)) {
      primaryClass = classification.class;
    }
  }

  // Update status to CLASSIFIED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "CLASSIFIED" },
  });

  // Step 3: Check building code triggers
  const maxMoisture = Math.max(
    ...inspection.moistureReadings.map((r: any) => r.moistureLevel),
    0,
  );

  const hasDrywall = inspection.moistureReadings.some(
    (r: any) =>
      r.surfaceType?.toLowerCase().includes("drywall") ||
      r.surfaceType?.toLowerCase().includes("gyprock"),
  );

  const buildingCodeTriggers = buildingCodeRequirements
    ? checkBuildingCodeTriggers(buildingCodeRequirements, {
        maxMoistureLevel: maxMoisture,
        hasDrywall,
        hasStructuralMaterials: true,
        daysSinceLoss: inspection.affectedAreas[0]?.timeSinceLoss
          ? Math.floor(inspection.affectedAreas[0].timeSinceLoss / 24)
          : undefined,
      })
    : null;

  // Step 4: Determine scope items
  const scopeItems = determineScopeItems({
    category: primaryCategory,
    class: primaryClass,
    waterSource: inspection.affectedAreas[0]?.waterSource || "Clean Water",
    affectedAreas: inspection.affectedAreas.map((area: any) => ({
      roomZoneId: area.roomZoneId,
      affectedSquareFootage: area.affectedSquareFootage,
      surfaceType: inspection.moistureReadings.find(
        (r: any) => r.location === area.roomZoneId,
      )?.surfaceType,
      moistureLevel: inspection.moistureReadings.find(
        (r: any) => r.location === area.roomZoneId,
      )?.moistureLevel,
    })),
    buildingCodeRequirements: buildingCodeRequirements || undefined,
    buildingCodeTriggers: buildingCodeTriggers || undefined,
    environmentalData: inspection.environmentalData,
  });

  // Save scope items
  for (const scopeItem of scopeItems) {
    await prisma.scopeItem.create({
      data: {
        inspectionId,
        itemType: scopeItem.itemType,
        description: scopeItem.description,
        justification: scopeItem.justification,
        quantity: scopeItem.quantity || null,
        unit: scopeItem.unit || null,
        specification: scopeItem.specification || null,
        autoDetermined: true,
        isRequired: scopeItem.isRequired,
        isSelected: true,
      },
    });
  }

  // Update status to SCOPED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "SCOPED" },
  });

  // Step 5: Estimate costs — pass userId so the engine loads the company's
  // NRPG-validated pricing config. Falls back to NRPG midpoints if none saved.
  const costEstimate = await estimateCosts(
    scopeItems,
    buildingCodeRequirements?.state,
    null, // pricingRates — let the engine fetch by userId
    inspectionOwnerId,
  );

  // Save cost estimates
  for (const costItem of costEstimate.items) {
    await prisma.costEstimate.create({
      data: {
        inspectionId,
        category: costItem.category,
        description: costItem.description,
        quantity: costItem.quantity,
        unit: costItem.unit,
        rate: costItem.rate,
        subtotal: costItem.subtotal,
        costDatabaseId: costItem.costDatabaseId || null,
        isEstimated: costItem.isEstimated,
        contingency: costEstimate.contingency / costEstimate.items.length, // Distribute contingency
        total:
          costItem.subtotal +
          costEstimate.contingency / costEstimate.items.length,
      },
    });
  }

  // Update status to ESTIMATED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "ESTIMATED" },
  });

  // Step 6: Mark as COMPLETED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "COMPLETED" },
  });

  return {
    classification: classifications[0],
    scopeItems,
    costEstimate,
  };
}
