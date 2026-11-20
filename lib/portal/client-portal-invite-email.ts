import { escapeHtml } from "@/lib/email";

export function clientPortalInviteSubject(contractorName: string): string {
  const trimmed = contractorName.trim() || "Your restoration team";
  return `${trimmed} — your secure claim portal`;
}

export function buildClientPortalInviteEmailHtml(input: {
  url: string;
  contractorName: string;
  clientName?: string | null;
  inspectionNumber?: string | null;
  propertyAddress?: string | null;
}): string {
  const safeUrl = escapeHtml(input.url);
  const safeContractor = escapeHtml(
    input.contractorName.trim() || "Your restoration team",
  );
  const clientName = input.clientName?.trim();
  const greeting = clientName
    ? `<p>Hi ${escapeHtml(clientName)},</p>`
    : "<p>Hello,</p>";
  const jobLine =
    input.propertyAddress?.trim()
      ? `<p><strong>${escapeHtml(input.inspectionNumber ?? "Your job")}</strong> — ${escapeHtml(input.propertyAddress)}</p>`
      : "";

  return `${greeting}
<p>${safeContractor} has shared your restoration claim with you.</p>
${jobLine}
<p>Use this secure link to view progress, add photos for your assessor, and complete any approvals required:</p>
<p><a href="${safeUrl}">Open your claim portal</a></p>
<p style="word-break:break-all;color:#64748b;font-size:12px">${safeUrl}</p>
<p>If you didn’t expect this email, you can ignore it.</p>
<p style="color:#94a3b8;font-size:11px">Sent via RestoreAssist on behalf of ${safeContractor}.</p>`;
}
