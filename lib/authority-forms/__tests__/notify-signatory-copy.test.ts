import { beforeEach, describe, expect, it, vi } from "vitest";

const formFindUnique = vi.hoisted(() => vi.fn());
const renderAuthorityFormPdf = vi.hoisted(() => vi.fn());
const sendSignedFormEmail = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormInstance: { findUnique: (...a: unknown[]) => formFindUnique(...a) },
  },
}));
vi.mock("@/lib/documents/render-authority-form", () => ({
  AUTHORITY_FORM_RENDER_INCLUDE: { template: true },
  renderAuthorityFormPdf,
}));
vi.mock("@/lib/email", () => ({ sendSignedFormEmail }));
vi.mock("@/lib/observability", () => ({ reportError }));

import { notifySignatoryOfSignedCopy } from "../notify-signatory-copy";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function form() {
  return {
    id: "f_1",
    companyName: "Wattle Restoration Pty Ltd",
    clientName: "Margaret Homeowner",
    clientAddress: "12 Wattle Street, Toowoomba QLD 4350",
    template: { code: "AUTH_COMMENCE", name: "Authority to Commence Work" },
    signatures: [
      {
        signatoryName: "Margaret",
        signatoryRole: "PROPERTY_OWNER",
        signedAt: new Date("2026-09-21T06:00:00.000Z"),
      },
    ],
  };
}

beforeEach(() => {
  formFindUnique.mockReset();
  renderAuthorityFormPdf.mockReset();
  sendSignedFormEmail.mockReset();
  reportError.mockReset();
});

describe("notifySignatoryOfSignedCopy", () => {
  it("returns without sending when the signatory has no email", async () => {
    await notifySignatoryOfSignedCopy({
      instanceId: "f_1",
      signatoryEmail: "  ",
      signatoryName: "Margaret",
    });
    await notifySignatoryOfSignedCopy({
      instanceId: "f_1",
      signatoryEmail: null,
      signatoryName: "Margaret",
    });

    expect(formFindUnique).not.toHaveBeenCalled();
    expect(sendSignedFormEmail).not.toHaveBeenCalled();
  });

  it("renders the signed PDF and emails it to the signatory", async () => {
    formFindUnique.mockResolvedValueOnce(form());
    renderAuthorityFormPdf.mockResolvedValueOnce({
      bytes: PDF_BYTES,
      filename: "AUTH_COMMENCE-CLM-42.pdf",
    });
    sendSignedFormEmail.mockResolvedValueOnce({
      data: { id: "msg_1" },
      error: null,
    });

    await notifySignatoryOfSignedCopy({
      instanceId: "f_1",
      signatoryEmail: "margaret@example.com",
      signatoryName: "Margaret",
    });

    expect(renderAuthorityFormPdf).toHaveBeenCalledTimes(1);
    expect(sendSignedFormEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "margaret@example.com",
        pdfBase64: Buffer.from(PDF_BYTES).toString("base64"),
        pdfFilename: "AUTH_COMMENCE-CLM-42-signed.pdf",
        copyKind: "signatory",
      }),
    );
  });
});
