/**
 * RA-1708 — exact prose shown to the signer before pre-attest hashes it.
 * Must match what the user sees in the consent checkbox panel.
 */

export function buildAttestationConsentSummary(input: {
  attestationType: string;
  actionLabel?: string;
  reportId: string;
}): string {
  const step =
    input.actionLabel?.trim() ||
    input.attestationType.replaceAll("_", " ").toLowerCase();
  return (
    `I am electronically signing the claim progress step "${step}" ` +
    `for report ${input.reportId}. I attest that the transition and ` +
    `recorded claim data are accurate to the best of my knowledge. ` +
    `This signature is intended to satisfy electronic transaction ` +
    `requirements in Australia and New Zealand.`
  );
}
