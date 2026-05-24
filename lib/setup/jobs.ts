/**
 * Background job runners for POST /api/setup/hydrate.
 *
 * Each function is fire-and-forget from the route — they write back to
 * HydrationJob and Organization on completion/error.
 */

import { prisma } from "@/lib/prisma";
import { lookupAbn } from "@/lib/integrations/abr/client";
import { scrapeWebsite } from "@/lib/branding/scrape";
import { isPublicHttpUrl } from "@/lib/branding/url-validator";
import { extractColors } from "@/lib/branding/extract-colors";
import { extractAboutCopy } from "@/lib/branding/extract-about";
import { getDefaultPricing, type AuState } from "@/lib/pricing/defaults-au";
import type {
  AbrEntityType,
  AbrLookupResult,
} from "@/lib/integrations/abr/parse";

// ── ABR job ───────────────────────────────────────────────────────────────────

export async function runAbrJob(orgId: string, abn: string): Promise<void> {
  // Cache hit?
  const cached = await prisma.abnLookupCache.findUnique({ where: { abn } });
  const fresh = cached !== null && cached.expiresAt > new Date();

  const lookup = fresh
    ? { ok: true as const, data: cached!.payload as unknown as AbrLookupResult }
    : await lookupAbn(abn);

  if (!fresh && lookup.ok) {
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    await prisma.abnLookupCache.upsert({
      where: { abn },
      create: { abn, payload: lookup.data as never, expiresAt: expires },
      update: {
        payload: lookup.data as never,
        fetchedAt: new Date(),
        expiresAt: expires,
      },
    });
  }

  if (!lookup.ok) {
    await prisma.hydrationJob.update({
      where: { organizationId_kind: { organizationId: orgId, kind: "ABR" } },
      data: {
        status: "ERROR",
        errorMessage: lookup.reason,
        completedAt: new Date(),
      },
    });
    return;
  }

  const data = lookup.data as AbrLookupResult;
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      legalName: data.legalName,
      tradingName: data.tradingNames[0] ?? null,
      acn: data.acn,
      state: data.state,
    },
  });
  await prisma.hydrationJob.update({
    where: { organizationId_kind: { organizationId: orgId, kind: "ABR" } },
    data: { status: "READY", payload: data as never, completedAt: new Date() },
  });
}

// ── Website job ───────────────────────────────────────────────────────────────

export async function runWebsiteJob(orgId: string, url: string): Promise<void> {
  // Defense-in-depth SSRF guard — primary check is at the route boundary,
  // but this function is also called from places that may bypass that.
  const urlCheck = isPublicHttpUrl(url);
  if (!urlCheck.ok) {
    await prisma.hydrationJob.update({
      where: {
        organizationId_kind: { organizationId: orgId, kind: "WEBSITE" },
      },
      data: {
        status: "MANUAL",
        errorMessage: "FETCH_FAILED",
        completedAt: new Date(),
      },
    });
    return;
  }
  const scrape = await scrapeWebsite(url);
  if (!scrape.ok) {
    await prisma.hydrationJob.update({
      where: {
        organizationId_kind: { organizationId: orgId, kind: "WEBSITE" },
      },
      data: {
        status: "MANUAL",
        errorMessage: scrape.reason,
        completedAt: new Date(),
      },
    });
    return;
  }

  let primaryColor: string | null = null;
  let accentColor: string | null = null;
  if (scrape.data.logoUrl) {
    try {
      // SSRF guard on the secondary logo fetch — og:image / icon href can be
      // a private URL even when the page itself was public.
      const logoCheck = isPublicHttpUrl(scrape.data.logoUrl);
      if (!logoCheck.ok) throw new Error("FETCH_FAILED");
      const res = await fetch(scrape.data.logoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const colors = await extractColors(buf);
        primaryColor = colors.primary;
        accentColor = colors.accent;
      }
    } catch {
      // Swallow — UI will let the user upload manually
    }
  }

  const about = await extractAboutCopy(scrape.data.hero);

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      logoUrl: scrape.data.logoUrl,
      primaryColor,
      accentColor,
      aboutCopy: about?.paragraph ?? null,
    },
  });
  await prisma.hydrationJob.update({
    where: { organizationId_kind: { organizationId: orgId, kind: "WEBSITE" } },
    data: {
      status: "READY",
      payload: {
        logoUrl: scrape.data.logoUrl,
        primaryColor,
        accentColor,
        aboutCopy: about?.paragraph ?? null,
      } as never,
      completedAt: new Date(),
    },
  });
}

// ── Pricing job ───────────────────────────────────────────────────────────────

export async function runPricingJob(orgId: string): Promise<void> {
  // Wait briefly for ABR to land (so we have state + entityType).
  type AbrPayload = { state?: string; entityType?: AbrEntityType };
  let abrData: AbrPayload | null = null;
  for (let i = 0; i < 10; i++) {
    const j = await prisma.hydrationJob.findUnique({
      where: { organizationId_kind: { organizationId: orgId, kind: "ABR" } },
      select: { status: true, payload: true },
    });
    if (j?.status === "READY" || j?.status === "ERROR") {
      abrData = (j.payload as AbrPayload) ?? null;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const state = (abrData?.state ?? "NSW") as AuState;
  const entityType = (abrData?.entityType ?? "OTHER") as AbrEntityType;
  const defaults = getDefaultPricing({ state, entityType });

  // Map PricingDefaults field names to OrganizationPricingConfig column names.
  // The two sets have different naming conventions — map explicitly rather than
  // spreading to avoid silent mismatches when either interface evolves.
  const pricingData = {
    masterQualifiedNormalHours: defaults.masterQualifiedNormalHours,
    masterQualifiedSaturday: Math.round(
      defaults.masterQualifiedNormalHours * defaults.saturdayMultiplier,
    ),
    masterQualifiedSunday: Math.round(
      defaults.masterQualifiedNormalHours * defaults.sundayMultiplier,
    ),
    qualifiedTechnicianNormalHours: defaults.qualifiedTechnicianNormalHours,
    qualifiedTechnicianSaturday: Math.round(
      defaults.qualifiedTechnicianNormalHours * defaults.saturdayMultiplier,
    ),
    qualifiedTechnicianSunday: Math.round(
      defaults.qualifiedTechnicianNormalHours * defaults.sundayMultiplier,
    ),
    labourerNormalHours: defaults.labourerNormalHours,
    labourerSaturday: Math.round(
      defaults.labourerNormalHours * defaults.saturdayMultiplier,
    ),
    labourerSunday: Math.round(
      defaults.labourerNormalHours * defaults.sundayMultiplier,
    ),
    airMoverAxialDailyRate: defaults.airMoverAxialPerDay,
    airMoverCentrifugalDailyRate: defaults.airMoverCentrifugalPerDay,
    dehumidifierLGRDailyRate: defaults.dehumidifierLgrPerDay,
    dehumidifierDesiccantDailyRate: defaults.dehumidifierDesiccantPerDay,
    afdUnitLargeDailyRate: defaults.afdNegativeAirPerDay,
    hepaVacuumDailyRate: defaults.hepaVacuumPerDay,
    administrationFee: defaults.administrationFee,
    callOutFee: defaults.callOutFee,
    mobilisationFee: defaults.mobilisationFee,
    thermalCameraUseCostPerAssessment:
      defaults.thermalCameraUseCostPerAssessment,
    antimicrobialTreatmentRate: defaults.antimicrobialTreatmentRate,
    mouldRemediationTreatmentRate: defaults.mouldRemediationTreatmentRate,
    projectManagementPercent: defaults.projectManagementPercent,
    saturdayMultiplier: defaults.saturdayMultiplier,
    sundayMultiplier: defaults.sundayMultiplier,
    afterHoursMultiplier: defaults.afterHoursMultiplier,
    publicHolidayMultiplier: defaults.publicHolidayMultiplier,
    // Required fields without PricingDefaults equivalents — use sensible defaults
    extractionTruckMountedHourlyRate: 0,
    extractionElectricHourlyRate: 0,
    injectionDryingSystemDailyRate: 0,
    biohazardTreatmentRate: 0,
  };

  await prisma.organizationPricingConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...pricingData },
    update: pricingData,
  });
  await prisma.hydrationJob.update({
    where: { organizationId_kind: { organizationId: orgId, kind: "PRICING" } },
    data: {
      status: "READY",
      payload: defaults as never,
      completedAt: new Date(),
    },
  });
}
