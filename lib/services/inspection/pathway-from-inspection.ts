/**
 * Wave 2 (W2-1) — load inspection facts and run composePathway server-side.
 */

import { prisma } from "@/lib/prisma";
import { composePathway } from "@/lib/claim-intelligence/compose-pathway";
import type { ClaimFacts, ClaimPathway } from "@/lib/claim-intelligence/types";
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { stateFromPostcode } from "@/lib/anz/postcode-state";

export async function loadClaimPathwayForInspection(
  inspectionId: string,
): Promise<ClaimPathway | null> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      claimType: true,
      propertyPostcode: true,
      propertyYearBuilt: true,
      propertyCountry: true,
      waterDamageClassification: {
        select: { waterCategory: true, damageClass: true },
      },
    },
  });

  if (!inspection?.claimType) return null;
  if (!normalizeClaimType(inspection.claimType)) return null;

  const waterCat = inspection.waterDamageClassification?.waterCategory;
  const waterCls = inspection.waterDamageClassification?.damageClass;

  const facts: ClaimFacts = {
    claimType: inspection.claimType,
    property: {
      buildYear: inspection.propertyYearBuilt ?? null,
      state: stateFromPostcode(inspection.propertyPostcode),
    },
    loss: {
      waterCategory:
        waterCat != null
          ? (String(waterCat).replace("CAT_", "") as "1" | "2" | "3")
          : null,
      waterClass:
        waterCls != null
          ? (Number(String(waterCls).replace("CLASS_", "")) as 1 | 2 | 3 | 4)
          : null,
    },
  };

  return composePathway(facts);
}