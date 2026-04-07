/**
 * ServiceM8 NIR Sync Module
 *
 * Translates a completed NIR into a ServiceM8 job + materials + note.
 * Best paired with Xero or MYOB for accounting.
 */

import { getTokens, markIntegrationError, logSync } from "../oauth-handler";
import { ServiceM8Client } from "./client";
import type { NIRJobPayload } from "../xero/nir-sync";

const SM8_BASE = "https://api.servicem8.com/api_1.0";

function dollars(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

export async function syncNIRJobToServiceM8(
  integrationId: string,
  job: NIRJobPayload,
): Promise<{ sm8JobUuid: string; sm8JobNumber?: string }> {
  const tokens = await getTokens(integrationId);
  if (!tokens.accessToken) throw new Error("ServiceM8 not connected");

  let accessToken = tokens.accessToken;
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new ServiceM8Client(integrationId);
    await client.refreshAccessToken();
    const freshTokens = await getTokens(integrationId);
    if (!freshTokens.accessToken)
      throw new Error("ServiceM8 token refresh failed");
    accessToken = freshTokens.accessToken;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const jobRes = await fetch(`${SM8_BASE}/job.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      status: "Completed",
      job_address: job.propertyAddress,
      company_name: job.clientName,
      ...(job.clientPhone && { contact_phone: job.clientPhone }),
      ...(job.clientEmail && { contact_email: job.clientEmail }),
      job_description: [
        `NIR: ${job.reportNumber}`,
        `Damage: ${job.damageType}`,
        job.waterCategory ? `Cat.${job.waterCategory}` : "",
        job.waterClass ? `Class ${job.waterClass}` : "",
        job.insuranceClaim ? `Claim: ${job.insuranceClaim}` : "",
        job.technician || "",
      ]
        .filter(Boolean)
        .join(" | "),
      completion_date: job.inspectionDate.toISOString().split("T")[0],
    }),
  });

  if (!jobRes.ok) {
    await markIntegrationError(
      integrationId,
      `ServiceM8 job create failed: ${jobRes.statusText}`,
    );
    throw new Error(`ServiceM8 error: ${jobRes.statusText}`);
  }

  const jobData = await jobRes.json();
  const jobUuid = jobData?.uuid || jobRes.headers.get("x-record-uuid");
  if (!jobUuid) throw new Error("ServiceM8: no job UUID returned");

  // Post materials (non-blocking — don't fail sync if individual items fail)
  await Promise.allSettled(
    job.scopeItems.map((item) =>
      fetch(`${SM8_BASE}/jobmaterial.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          job_uuid: jobUuid,
          name: item.iicrcRef
            ? `${item.description} [${item.iicrcRef}]`
            : item.description,
          unit_price: dollars(item.unitPriceExGST),
          qty: item.quantity,
          active: 1,
          notes: item.category,
        }),
      }),
    ),
  );

  // Post NIR summary note
  await fetch(`${SM8_BASE}/jobnote.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      job_uuid: jobUuid,
      note: [
        `=== NIR Restoration Report ===`,
        `Report ID: ${job.reportId}`,
        `Property: ${job.propertyAddress}`,
        `Damage: ${job.damageType}${job.waterCategory ? " Cat." + job.waterCategory : ""}${job.waterClass ? " Class " + job.waterClass : ""}`,
        job.insuranceClaim ? `Insurance Claim: ${job.insuranceClaim}` : "",
        `Total (ex GST): $${dollars(job.totalExGST)}`,
        `Total (inc GST): $${dollars(job.totalIncGST)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  }).catch(() => {}); // note failure is non-fatal

  await logSync(integrationId, "FULL", "SUCCESS", 1, 0);
  return { sm8JobUuid: jobUuid, sm8JobNumber: jobData?.generated_job_id };
}
