/**
 * Client-portal recovery and help stay on /portal/*.
 * Contractor auth and /dashboard/help are never a client recovery path.
 */

export const PORTAL_PATHS = {
  home: "/portal",
  login: "/portal/login",
  signup: "/portal/signup",
  help: "/portal/help",
  recovery: "/portal/recovery",
} as const;

export const GENERIC_INVITE_RESEND_MESSAGE =
  "If a matching invitation exists, a new link is on its way. If nothing arrives, ask the restoration contractor to send one, or use the job link they emailed.";

export type ForbiddenClientHrefId =
  | "dashboard-help"
  | "contractor-login"
  | "contractor-signup"
  | "dashboard-root"
  | "public-contractor-help";

const FORBIDDEN_CLIENT_HREF_PATTERNS: Array<{
  id: ForbiddenClientHrefId;
  re: RegExp;
}> = [
  { id: "dashboard-help", re: /(?:href|to)=["']\/dashboard\/help|\]\(\/dashboard\/help/ },
  {
    id: "contractor-login",
    re: /(?:href|to)=["']\/login(?:\?|["'#])|\]\(\/login(?:\)|\?)/,
  },
  {
    id: "contractor-signup",
    re: /(?:href|to)=["']\/signup(?:\?|["'#])|\]\(\/signup(?:\)|\?)/,
  },
  { id: "dashboard-root", re: /(?:href|to)=["']\/dashboard(?:\/|"|')|\]\(\/dashboard/ },
  {
    id: "public-contractor-help",
    re: /(?:href|to)=["']\/help(?:\/|"|'|#)|\]\(\/help(?:\/|\))/,
  },
];

/** Returns the forbidden-href ids found in source. Empty means the source is clean. */
export function findForbiddenClientPortalHrefs(
  source: string,
): ForbiddenClientHrefId[] {
  return FORBIDDEN_CLIENT_HREF_PATTERNS.filter((pattern) =>
    pattern.re.test(source),
  ).map((pattern) => pattern.id);
}

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normaliseRecoveryEmail(value: string): string {
  return value.trim().toLowerCase();
}
