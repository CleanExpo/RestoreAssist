const USER_INVITE_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const PORTAL_INVITATION_TOKEN_PATTERN = /^c[a-z0-9]{24}$/;

export function isUserInviteToken(value: unknown): value is string {
  return typeof value === "string" && USER_INVITE_TOKEN_PATTERN.test(value);
}

export function isPortalInvitationToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    PORTAL_INVITATION_TOKEN_PATTERN.test(value)
  );
}
