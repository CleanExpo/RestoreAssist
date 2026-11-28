/**
 * RA-8613 - emails the stateless recovery link (lib/portal/recovery-token.ts)
 * to the address on a portal account. The link exists only in this email: it
 * is not stored and no API returns it.
 */

import { getAppUrl } from "@/lib/app-url";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { escapeHtml } from "@/lib/email";
import {
  RECOVERY_LIFETIME_SECONDS,
  signRecoveryToken,
  type RecoveryAccount,
} from "@/lib/portal/recovery-token";

export function buildRecoveryEmailHtml(input: {
  clientName: string;
  recoveryUrl: string;
}): string {
  const clientName = escapeHtml(input.clientName);
  const url = escapeHtml(input.recoveryUrl);
  const minutes = Math.round(RECOVERY_LIFETIME_SECONDS / 60);
  return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Set a new portal password</h2>
            <p>Hi ${clientName},</p>
            <p>We received a request to set a new password for your RestoreAssist client portal account.</p>
            <p style="margin: 30px 0;">
              <a href="${url}" style="background-color: #8A6B4E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Set a new password
              </a>
            </p>
            <p style="font-size: 12px; color: #666;">
              This link works once and stops working within ${minutes} minutes. If you did not ask for it, ignore this email and your password stays as it is.
            </p>
            <p style="font-size: 12px; color: #666;">
              Link not working? Copy and paste this address:<br/>
              ${url}
            </p>
          </div>
        `;
}

/** Returns whether the email was handed to the mail provider without error. */
export async function emailRecoveryLink(
  account: RecoveryAccount & { name: string },
  organizationId: string | null = null,
): Promise<boolean> {
  // The public request answers identically whether or not this succeeds, so a
  // failure here (mail or signing config) must not surface as an error that
  // tells a caller the address has an account.
  try {
    const token = await signRecoveryToken(account);
    const result = await sendTransactionalEmail({
      organizationId,
      to: account.email,
      subject: "Set a new password for your RestoreAssist client portal",
      html: buildRecoveryEmailHtml({
        clientName: account.name,
        recoveryUrl: `${getAppUrl()}/portal/signup?token=${token}`,
      }),
    });
    return !result.error;
  } catch {
    console.error("[portal] recovery email could not be sent");
    return false;
  }
}
