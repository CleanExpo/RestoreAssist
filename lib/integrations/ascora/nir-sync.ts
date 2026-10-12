/**
 * Compatibility boundary for the retired generic Integration → Ascora path.
 *
 * Ascora uses the separate, owner-scoped AscoraIntegration static-key store.
 * A generic Integration ID must never dispatch through a process-wide API key.
 * The canonical Ascora routes/services remain the supported integration path.
 */
import type { NIRJobPayload } from "../xero/nir-sync";

export async function syncNIRJobToAscora(
  _integrationId: string,
  _job: NIRJobPayload,
): Promise<{ ascoraJobId: string; ascoraJobNumber?: string }> {
  throw new Error("Generic Integration dispatch to Ascora is unsupported; use the configured Ascora connection");
}
