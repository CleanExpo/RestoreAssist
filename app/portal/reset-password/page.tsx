import { redirect } from "next/navigation";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";

/**
 * Self-serve password reset is closed (account-takeover + email enumeration).
 * Old bookmarks land on the invitation resend path instead of a 503 form.
 */
export default function PortalResetPasswordPage() {
  redirect(PORTAL_PATHS.recovery);
}
