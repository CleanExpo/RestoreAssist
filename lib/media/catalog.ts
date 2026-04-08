/**
 * RA-417: Media Asset Cataloging Engine
 *
 * Auto-catalogs MediaAsset records by multiple dimensions after upload.
 * Tags are upserted so this is safe to call multiple times (idempotent).
 *
 * Cataloging dimensions:
 *  - job          → inspectionId + inspection number
 *  - room         → from guided capture workflow room assignments
 *  - damage_type  → EvidenceClass from linked EvidenceItem
 *  - date_bucket  → EXIF capturedAt → YYYY-MM (month bucket)
 *  - location     → GPS coordinates → postcode/suburb via Inspection record
 *  - technician   → capturedByName from linked EvidenceItem
 *  - device       → deviceMake + deviceModel from MediaAsset EXIF
 */

import { prisma } from "../prisma";

// ── Types ──────────────────────────────────────────────────────────────────

interface TagInput {
  category: string;
  value: string;
  inspectionId?: string;
  evidenceId?: string;
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Catalog a MediaAsset by all available dimensions.
 * Fire-and-forget safe: caller does not need to await.
 */
export async function catalogMediaAsset(
  assetId: string,
  workspaceId: string
): Promise<void> {
  // Load the asset with inspection context
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      inspectionId: true,
      evidenceId: true,
      capturedAt: true,
      latitude: true,
      longitude: true,
      deviceMake: true,
      deviceModel: true,
      inspection: {
        select: {
          id: true,
          inspectionNumber: true,
          propertyAddress: true,
          propertyPostcode: true,
        },
      },
    },
  });

  if (!asset) {
    console.warn(`[catalogMediaAsset] Asset ${assetId} not found`);
    return;
  }

  const tags: TagInput[] = [];

  // ── Dimension: job ─────────────────────────────────────────────────────
  if (asset.inspection) {
    tags.push({
      category: "job",
      value: asset.inspection.inspectionNumber,
      inspectionId: asset.inspectionId,
    });
  }

  // ── Dimension: date_bucket ─────────────────────────────────────────────
  const capturedAt = asset.capturedAt;
  if (capturedAt) {
    const bucket = `${capturedAt.getFullYear()}-${String(capturedAt.getMonth() + 1).padStart(2, "0")}`;
    tags.push({ category: "date_bucket", value: bucket });
  }

  // ── Dimension: location ────────────────────────────────────────────────
  if (asset.inspection?.propertyPostcode) {
    tags.push({
      category: "location",
      value: asset.inspection.propertyPostcode,
      inspectionId: asset.inspectionId,
    });
  }

  // ── Dimension: device ──────────────────────────────────────────────────
  if (asset.deviceMake || asset.deviceModel) {
    const deviceLabel = [asset.deviceMake, asset.deviceModel]
      .filter(Boolean)
      .join(" ");
    if (deviceLabel.trim()) {
      tags.push({ category: "device", value: deviceLabel.trim() });
    }
  }

  // ── Dimensions from linked EvidenceItem ───────────────────────────────
  if (asset.evidenceId) {
    const evidence = await prisma.evidenceItem.findUnique({
      where: { id: asset.evidenceId },
      select: {
        id: true,
        evidenceClass: true,
        capturedByName: true,
        workflowStep: {
          select: { id: true } as any,
        },
      },
    });

    if (evidence) {
      // damage_type from EvidenceClass
      const damageLabel = formatEvidenceClass(evidence.evidenceClass);
      tags.push({
        category: "damage_type",
        value: damageLabel,
        evidenceId: evidence.id,
      });

      // technician from capturedByName
      if (evidence.capturedByName.trim()) {
        tags.push({
          category: "technician",
          value: evidence.capturedByName.trim(),
        });
      }

      // room from workflow step title (if available)
      if ((evidence.workflowStep as any)?.title) {
        tags.push({
          category: "room",
          value: (evidence.workflowStep as any).title as string,
          evidenceId: evidence.id,
        });
      }
    }
  }

  // Upsert all tags in one batch
  if (tags.length === 0) return;

  await prisma.$transaction(
    tags.map((tag) =>
      prisma.mediaAssetTag.upsert({
        where: {
          assetId_category_value: {
            assetId,
            category: tag.category,
            value: tag.value,
          },
        },
        create: {
          assetId,
          workspaceId,
          category: tag.category,
          value: tag.value,
          inspectionId: tag.inspectionId ?? null,
          evidenceId: tag.evidenceId ?? null,
        },
        update: {}, // no-op update — tag already exists
      })
    )
  );
}

/**
 * Schedule cataloging as a fire-and-forget background task.
 * Safe to call immediately after asset creation.
 */
export function scheduleCatalog(assetId: string, workspaceId: string): void {
  setImmediate(() => {
    catalogMediaAsset(assetId, workspaceId).catch((err) => {
      console.error(`[catalogMediaAsset] Failed for asset ${assetId}:`, err);
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert EvidenceClass enum value to a human-readable label.
 * e.g. "PHOTO_DAMAGE" → "Photo: Damage"
 */
function formatEvidenceClass(evidenceClass: string): string {
  const labelMap: Record<string, string> = {
    MOISTURE_READING: "Moisture Reading",
    THERMAL_IMAGE: "Thermal Image",
    AMBIENT_ENVIRONMENTAL: "Environmental Data",
    PHOTO_DAMAGE: "Photo: Damage",
    PHOTO_EQUIPMENT: "Photo: Equipment",
    PHOTO_PROGRESS: "Photo: Progress",
    PHOTO_COMPLETION: "Photo: Completion",
    VIDEO_WALKTHROUGH: "Video Walkthrough",
    FLOOR_PLAN: "Floor Plan",
    SCOPE_DOCUMENT: "Scope Document",
    LAB_RESULT: "Lab Result",
    AUTHORITY_FORM: "Authority Form",
    EQUIPMENT_LOG: "Equipment Log",
    TECHNICIAN_NOTE: "Technician Note",
    VOICE_MEMO: "Voice Memo",
    THIRD_PARTY_REPORT: "Third Party Report",
    COMPLIANCE_CERTIFICATE: "Compliance Certificate",
  };
  return labelMap[evidenceClass] ?? evidenceClass.replace(/_/g, " ").toLowerCase();
}
