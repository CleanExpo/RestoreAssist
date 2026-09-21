/**
 * RA-7603 — a homeowner who e-signs at /sign/[token] must receive a copy.
 *
 * These assertions fail on main: POST records the signature and returns
 * `{ success }` without calling sendSignedFormEmail. After the fix they
 * pass, including the double-tap case gated by the atomic updateMany.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, opts: { message: string; status: number }) =>
    new Response(JSON.stringify({ error: opts.message }), {
      status: opts.status,
      headers: { "content-type": "application/json" },
    }),
}));

const sendSignedFormEmail = vi.hoisted(() => vi.fn());
const renderAuthorityFormPdf = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({ sendSignedFormEmail }));
vi.mock("@/lib/documents/render-authority-form", () => ({
  AUTHORITY_FORM_RENDER_INCLUDE: {
    template: true,
    signatures: { orderBy: { createdAt: "asc" } },
    report: { select: { claimReferenceNumber: true } },
  },
  renderAuthorityFormPdf,
}));
vi.mock("@/lib/observability", () => ({ reportError }));

const sigFindUnique = vi.fn();
const sigUpdateMany = vi.fn();
const sigCount = vi.fn();
const instanceUpdate = vi.fn();
const instanceFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormSignature: {
      findUnique: (...a: unknown[]) => sigFindUnique(...a),
      updateMany: (...a: unknown[]) => sigUpdateMany(...a),
      count: (...a: unknown[]) => sigCount(...a),
    },
    authorityFormInstance: {
      update: (...a: unknown[]) => instanceUpdate(...a),
      findUnique: (...a: unknown[]) => instanceFindUnique(...a),
    },
  },
}));

import { POST } from "../route";

const VALID_TOKEN = "11111111-1111-4111-8111-111111111111";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/authority-forms/sign/${VALID_TOKEN}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}
const ctx = (token = VALID_TOKEN) => ({ params: Promise.resolve({ token }) });

function unsignedSignature(over: Record<string, unknown> = {}) {
  return {
    id: "s_1",
    instanceId: "f_1",
    signatoryName: "Margaret",
    signatoryEmail: "margaret@example.com",
    ...over,
  };
}

function signedForm() {
  return {
    id: "f_1",
    companyName: "Wattle Restoration Pty Ltd",
    companyLogo: null,
    companyABN: null,
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    companyAddress: null,
    clientName: "Margaret Homeowner",
    clientAddress: "12 Wattle Street, Toowoomba QLD 4350",
    incidentDate: new Date("2026-09-01T00:00:00.000Z"),
    incidentBrief: "Supply line failed.",
    authorityDescription: "Authority to commence restoration work.",
    template: { code: "AUTH_COMMENCE", name: "Authority to Commence Work" },
    signatures: [
      {
        signatoryName: "Margaret",
        signatoryRole: "PROPERTY_OWNER",
        signatureData: "data:image/png;base64,AA",
        signedAt: new Date("2026-09-21T06:00:00.000Z"),
        signatoryEmail: "margaret@example.com",
      },
    ],
    report: {
      claimReferenceNumber: "CLM-42",
      inspection: { propertyCountry: "AU" },
    },
  };
}

function mockSuccessfulSign() {
  sigFindUnique
    .mockResolvedValueOnce(unsignedSignature())
    .mockResolvedValueOnce({ id: "s_1", instanceId: "f_1" });
  sigUpdateMany.mockResolvedValueOnce({ count: 1 });
  sigCount.mockResolvedValueOnce(0);
  instanceUpdate.mockResolvedValueOnce({});
  instanceFindUnique.mockResolvedValueOnce(signedForm());
  renderAuthorityFormPdf.mockResolvedValueOnce({
    bytes: PDF_BYTES,
    filename: "AUTH_COMMENCE-CLM-42.pdf",
  });
  sendSignedFormEmail.mockResolvedValueOnce({
    data: { id: "msg_signed_copy" },
    error: null,
  });
}

beforeEach(() => {
  sigFindUnique.mockReset();
  sigUpdateMany.mockReset();
  sigCount.mockReset();
  instanceUpdate.mockReset();
  instanceFindUnique.mockReset();
  sendSignedFormEmail.mockReset();
  renderAuthorityFormPdf.mockReset();
  reportError.mockReset();
});

describe("POST /api/authority-forms/sign/[token] — signatory copy email (RA-7603)", () => {
  it("emails the signatory a signed PDF copy after a successful atomic sign", async () => {
    mockSuccessfulSign();

    const res = await POST(
      postReq({ signatureData: "data:image/png;base64,AA" }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      allSigned: true,
      formId: "f_1",
    });

    expect(sendSignedFormEmail).toHaveBeenCalledTimes(1);
    expect(sendSignedFormEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "margaret@example.com",
        recipientName: "Margaret",
        formName: "Authority to Commence Work",
        clientName: "Margaret Homeowner",
        pdfBase64: Buffer.from(PDF_BYTES).toString("base64"),
        pdfFilename: "AUTH_COMMENCE-CLM-42-signed.pdf",
        copyKind: "signatory",
      }),
    );
  });

  it("does not email on a double-tap (updateMany matched 0 rows)", async () => {
    sigFindUnique.mockResolvedValueOnce(unsignedSignature());
    sigUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(
      postReq({ signatureData: "data:image/png;base64,AA" }),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect(sendSignedFormEmail).not.toHaveBeenCalled();
    expect(renderAuthorityFormPdf).not.toHaveBeenCalled();
  });

  it("still returns success when the copy email throws", async () => {
    mockSuccessfulSign();
    sendSignedFormEmail.mockReset();
    sendSignedFormEmail.mockRejectedValueOnce(new Error("mailtrap 500"));

    const res = await POST(
      postReq({ signatureData: "data:image/png;base64,AA" }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      formId: "f_1",
    });
    expect(sendSignedFormEmail).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "authority-form-signatory-copy" }),
    );
  });

  it("still returns success when PDF rendering throws", async () => {
    mockSuccessfulSign();
    renderAuthorityFormPdf.mockReset();
    renderAuthorityFormPdf.mockRejectedValueOnce(new Error("pdf-lib failed"));

    const res = await POST(
      postReq({ signatureData: "data:image/png;base64,AA" }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(sendSignedFormEmail).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalled();
  });

  it("does not email when the signature has no signatoryEmail", async () => {
    mockSuccessfulSign();
    sigFindUnique.mockReset();
    sigFindUnique
      .mockResolvedValueOnce(
        unsignedSignature({ signatoryEmail: null }),
      )
      .mockResolvedValueOnce({ id: "s_1", instanceId: "f_1" });

    const res = await POST(
      postReq({ signatureData: "data:image/png;base64,AA" }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(sendSignedFormEmail).not.toHaveBeenCalled();
    expect(renderAuthorityFormPdf).not.toHaveBeenCalled();
  });
});
