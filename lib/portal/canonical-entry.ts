export const CLIENT_PORTAL_ENTRY_PATH = "/portal/login" as const;
export const CLIENT_PORTAL_HOME_PATH = "/portal" as const;
export const CLIENT_PORTAL_JOB_PATH_PATTERN = "/portal/:token" as const;

export const CLIENT_PORTAL_PUBLIC_CTA = {
  href: CLIENT_PORTAL_ENTRY_PATH,
  label: "Client portal",
  invitedLabel: "Already invited?",
} as const;

export const CLIENT_PORTAL_ENTRY_ALIASES = [
  "/client",
  "/share",
  "/invite",
  "/client-portal",
  "/clientportal",
  "/shared",
] as const;

export const CLIENT_PORTAL_JOB_ALIASES = [
  "/client/:token",
  "/share/:token",
  "/client-portal/:token",
  "/clientportal/:token",
  "/shared/:token",
] as const;
