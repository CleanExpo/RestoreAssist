/**
 * RA-7603 — email the signatory a copy of the authority form they just signed.
 *
 * Called only after the atomic `updateMany` on /sign/[token] matches a row
 * (the unsigned → signed transition). Failures must be reported, never
 * thrown through to the signing response.
 */

import { prisma } from "@/lib/prisma";
import {
  AUTHORITY_FORM_RENDER_INCLUDE,
  renderAuthorityFormPdf,
} from "@/lib/documents/render-authority-form";
import { sendSignedFormEmail } from "@/lib/email";
import { reportError } from "@/lib/observability";

const MAX_FORM_SIGNATURES = 25;

export async function notifySignatoryOfSignedCopy(input: {
  instanceId: string;
  signatoryEmail: string | null | undefined;
  signatoryName: string;
}): Promise<void> {
  const recipientEmail = input.signatoryEmail?.trim();
  if (!recipientEmail) return;

  const form = await prisma.authorityFormInstance.findUnique({
    where: { id: input.instanceId },
    include: {
      ...AUTHORITY_FORM_RENDER_INCLUDE,
      signatures: {
        orderBy: { createdAt: "asc" },
        take: MAX_FORM_SIGNATURES,
      },
    },
  });

  if (!form) {
    reportError(
      new Error("Authority form not found for signatory copy email"),
      {
        stage: "authority-form-signatory-copy",
        instanceId: input.instanceId,
      },
    );
    return;
  }

  const { bytes, filename } = await renderAuthorityFormPdf(form);
  const pdfBase64 = Buffer.from(bytes).toString("base64");
  const pdfFilename = filename.replace(/\.pdf$/i, "-signed.pdf");

  const signedSignatories = form.signatures
    .filter((s) => s.signedAt)
    .map((s) => ({
      name: s.signatoryName,
      role: s.signatoryRole,
      signedAt: s.signedAt!.toISOString(),
    }));

  await sendSignedFormEmail({
    recipientEmail,
    recipientName: input.signatoryName,
    formName: form.template.name,
    clientName: form.clientName,
    clientAddress: form.clientAddress,
    companyName: form.companyName,
    signatories: signedSignatories,
    pdfBase64,
    pdfFilename,
    copyKind: "signatory",
  });
}
