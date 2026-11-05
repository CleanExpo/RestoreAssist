/** Strip token material before a Zoho error is stored or logged. */
export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(
      /("(?:access_token|refresh_token|client_secret)"\s*:\s*")[^"]*(")/gi,
      "$1[redacted]$2",
    )
    .replace(
      /((?:access_token|refresh_token|client_secret)=)[^&\s]+/gi,
      "$1[redacted]",
    );
}
