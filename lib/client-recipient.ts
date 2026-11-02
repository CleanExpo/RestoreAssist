/**
 * The one rule for which client a job's email goes to (RA-7997).
 *
 * A job can carry a client through its report, directly, or both. Every send
 * path and every readiness check reads this, so a readiness screen can never
 * say "ready" for a job the send would refuse. The report's client comes first
 * because it is the record the report itself is addressed to. A linked report
 * client with a blank address means no recipient, never the job's client: the
 * two links are independent, so that could send one client's report to another.
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
  const client = sources.reportClient ?? sources.inspectionClient;
  const email = client?.email?.trim();
  return client && email ? { client, email } : null;
}
