/**
 * The one rule for which client a job's email goes to (RA-7997).
 *
 * A job can carry a client through its report, directly, or both. Every send
 * path and every readiness check reads this, so a readiness screen can never
 * say "ready" for a job the send would refuse. The report's client comes first
 * because it is the record the report itself is addressed to; a client with a
 * blank address is skipped rather than treated as the answer.
 */
export interface ClientRecipientSources<C extends { email?: string | null }> {
  reportClient?: C | null;
  inspectionClient?: C | null;
}

export interface ResolvedClientRecipient<C> {
  client: C;
  email: string;
}

export function resolveClientRecipient<C extends { email?: string | null }>(
  sources: ClientRecipientSources<C>,
): ResolvedClientRecipient<C> | null {
  for (const client of [sources.reportClient, sources.inspectionClient]) {
    const email = client?.email?.trim();
    if (client && email) return { client, email };
  }
  return null;
}
