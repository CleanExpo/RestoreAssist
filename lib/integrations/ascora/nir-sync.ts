/**
 * Ascora NIR Sync Module — v2 (rewritten against Ascora API v1.7)
 *
 * Pushes a completed NIR to Ascora as a new Job.
 *
 * Ascora uses a STATIC API key (not OAuth). The key is set once in
 * Administration → API Settings and sent in the `Auth` header on every
 * request. No token refresh, no PKCE, no auth-code flow.
 *
 * API reference: https://www.ascora.com.au/Assets/Guides/AscoraApiGuide.pdf
 *
 * Endpoint: POST https://api.ascora.com.au/Jobs/Job/
 * Auth:     Auth: <ASCORA_API_KEY>
 */

import { markIntegrationError, logSync } from "../oauth-handler";
import type { NIRJobPayload } from "../xero/nir-sync";

const ASCORA_BASE = "https://api.ascora.com.au";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.ASCORA_API_KEY;
  if (!key) throw new Error("ASCORA_API_KEY is not configured");
  return key;
}

/** Map NIRJobPayload damage type to an Ascora Job Type name. */
function getAscoraJobTypeName(damageType: NIRJobPayload["damageType"]): string {
  switch (damageType) {
    case "WATER":
      return process.env.ASCORA_JOB_TYPE_WATER || "Water Damage";
    case "FIRE":
      return process.env.ASCORA_JOB_TYPE_FIRE || "Fire Damage";
    case "MOULD":
      return process.env.ASCORA_JOB_TYPE_MOULD || "Mould Remediation";
    default:
      return process.env.ASCORA_JOB_TYPE_WATER || "Water Damage";
  }
}

/** Convert cents (integer) to dollars (float). */
function cents(c: number): number {
  return Math.round(c) / 100;
}

/**
 * Best-effort split of a single-line Australian address into Ascora fields.
 * Falls back to putting the entire string in addressLine1 if parsing fails.
 */
function parseAddress(address: string): {
  addressLine1: string;
  addressLine2: string;
  suburb: string;
  postcode: string;
  country: string;
} {
  const result = {
    addressLine1: address,
    addressLine2: "",
    suburb: "",
    postcode: "",
    country: "Australia",
  };

  // Try to extract a 4-digit Australian postcode from the end
  const postcodeMatch = address.match(/\b(\d{4})$/);
  if (postcodeMatch) {
    result.postcode = postcodeMatch[1];
    const beforePostcode = address
      .slice(0, -4)
      .trim()
      .replace(/,?\s*$/, "");

    // Split remaining by last comma to get suburb
    const lastComma = beforePostcode.lastIndexOf(",");
    if (lastComma > 0) {
      result.suburb = beforePostcode
        .slice(lastComma + 1)
        .trim()
        // Strip state abbreviation if present (e.g. "QLD", "NSW")
        .replace(/\s+(QLD|NSW|VIC|WA|SA|TAS|NT|ACT)\s*$/i, "")
        .trim();
      result.addressLine1 = beforePostcode.slice(0, lastComma).trim();
    }
  }

  return result;
}

// ── Main Sync Function ───────────────────────────────────────────────────────

export async function syncNIRJobToAscora(
  integrationId: string,
  job: NIRJobPayload,
): Promise<{ ascoraJobId: string; ascoraJobNumber?: string }> {
  const apiKey = getApiKey();

  const headers = {
    Auth: apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // ── Build damage classification label ────────────────────────────────────
  const classificationParts = [
    job.damageType,
    job.waterCategory ? `Cat.${job.waterCategory}` : "",
    job.waterClass ? `Class ${job.waterClass}` : "",
  ].filter(Boolean);
  const damageLabel = classificationParts.join(" ");

  // ── Build scope items summary for job description ────────────────────────
  const scopeSummary = job.scopeItems
    .map((item, i) => {
      const ref = item.iicrcRef ? ` [${item.iicrcRef}]` : "";
      return `${i + 1}. ${item.description}${ref} — ${item.quantity} ${item.unit} @ $${cents(item.unitPriceExGST).toFixed(2)}`;
    })
    .join("\n");

  // ── Build job description ────────────────────────────────────────────────
  const descriptionParts = [
    `NIR Report: ${job.reportNumber}`,
    `Damage: ${damageLabel}`,
    job.technician ? `Technician: ${job.technician}` : "",
    job.insuranceClaim ? `Insurance Claim: ${job.insuranceClaim}` : "",
    "",
    "Scope of Works:",
    scopeSummary,
    "",
    `Total ex GST: $${cents(job.totalExGST).toFixed(2)} AUD`,
    `GST: $${cents(job.gstAmount).toFixed(2)}`,
    `Total inc GST: $${cents(job.totalIncGST).toFixed(2)} AUD`,
    job.notes ? `\nNotes: ${job.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // ── Parse address into Ascora fields ─────────────────────────────────────
  const addr = parseAddress(job.propertyAddress);

  // ── Build Ascora Job payload (v1.7 contract) ─────────────────────────────
  const ascoraPayload = {
    jobName: `NIR ${job.reportNumber} — ${damageLabel}`,
    jobDescription: descriptionParts,
    pricingMethod: "FIXED-PRICE",
    totalExTax: cents(job.totalExGST),
    totalIncTax: cents(job.totalIncGST),
    jobStatus: 2, // Completed
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    suburb: addr.suburb,
    postcode: addr.postcode,
    country: addr.country,
    completedDate: job.inspectionDate.toISOString(),

    // Ascora matches customers by name if no ID is provided
    siteCustomer: { name: job.clientName },

    // Map damage type to Ascora Job Type by name
    jobType: { name: getAscoraJobTypeName(job.damageType) },

    // Insurance claim as purchase order reference
    ...(job.insuranceClaim && { purchaseOrderNumber: job.insuranceClaim }),

    // Custom fields for IICRC classification data
    customFields: [
      { fieldName: "NIR Report Number", fieldValue: job.reportNumber },
      { fieldName: "Damage Category", fieldValue: damageLabel },
      ...(job.waterCategory
        ? [
            {
              fieldName: "Water Category",
              fieldValue: `Category ${job.waterCategory}`,
            },
          ]
        : []),
      ...(job.waterClass
        ? [{ fieldName: "Water Class", fieldValue: `Class ${job.waterClass}` }]
        : []),
      ...(job.technician
        ? [{ fieldName: "Technician", fieldValue: job.technician }]
        : []),
    ],
  };

  // ── POST to Ascora Jobs API ──────────────────────────────────────────────
  const res = await fetch(`${ASCORA_BASE}/Jobs/Job/`, {
    method: "POST",
    headers,
    body: JSON.stringify(ascoraPayload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    await markIntegrationError(
      integrationId,
      `Ascora API ${res.status}: ${errBody}`,
    );
    throw new Error(
      `Ascora API error: ${res.status} ${res.statusText} — ${errBody}`,
    );
  }

  const data = await res.json();

  // Ascora returns { job: { jobId, jobNumber, ... }, success: true }
  if (!data.success) {
    const msg = data.message || data.error || JSON.stringify(data);
    await markIntegrationError(integrationId, `Ascora rejected: ${msg}`);
    throw new Error(`Ascora rejected the job: ${msg}`);
  }

  const ascoraJobId = data.job?.jobId;
  const ascoraJobNumber = data.job?.jobNumber;

  if (!ascoraJobId) {
    throw new Error("Ascora: no jobId in successful response");
  }

  await logSync(integrationId, "FULL", "SUCCESS", 1, 0);
  return { ascoraJobId: String(ascoraJobId), ascoraJobNumber };
}
