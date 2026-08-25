import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const formFindUnique = vi.hoisted(() => vi.fn());
const generatePdf = vi.hoisted(() => vi.fn());
const deliverEmailOnce = vi.hoisted(() => vi.fn());
const sendSignedFormEmail = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { authorityFormInstance: { findUnique: formFindUnique } },
}));
vi.mock("@/lib/generate-authority-form-pdf", () => ({
  generateAuthorityFormPDF: generatePdf,
}));
vi.mock("@/lib/email", () => ({ sendSignedFormEmail }));
vi.mock("@/lib/email-delivery-ledger", () => ({ deliverEmailOnce }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_request: unknown, _userId: string, run: () => unknown) => run(),
}));

import { POST } from "../route";

function form() {
  return {
    id: "form-1",
    companyName: "Restore Co",
    companyLogo: null,
    companyABN: null,
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    companyAddress: null,
    clientName: "Client",
    clientAddress: "1 Test St",
    incidentDate: new Date("2026-08-24T00:00:00Z"),
    incidentBrief: "Water loss",
    authorityDescription: "Authority",
    template: { code: "AUTH", name: "Authority to Proceed" },
    report: {
      id: "report-1",
      userId: "admin-1",
      assignedManagerId: null,
      assignedAdminId: null,
      claimReferenceNumber: "CLM-1",
    },
    signatures: [
      {
        id: "sig-1",
        signatoryName: "One",
        signatoryRole: "Owner",
        signatoryEmail: "one@example.com",
        signatureData: "data:image/png;base64,AA==",
        signedAt: new Date("2026-08-25T00:00:00Z"),
        createdAt: new Date("2026-08-25T00:00:00Z"),
      },
      {
        id: "sig-2",
        signatoryName: "Two",
        signatoryRole: "Tenant",
        signatoryEmail: "two@example.com",
        signatureData: "data:image/png;base64,AA==",
        signedAt: new Date("2026-08-25T00:01:00Z"),
        createdAt: new Date("2026-08-25T00:01:00Z"),
      },
    ],
  };
}

async function post() {
  return POST(
    new NextRequest("https://restoreassist.app/api/authority-forms/form-1/send-completed", {
      method: "POST",
      headers: { "Idempotency-Key": "delivery-run-1" },
    }),
    { params: Promise.resolve({ id: "form-1" }) },
  );
}

describe("POST completed authority-form delivery states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "admin-1" } });
    formFindUnique.mockResolvedValue(form());
    generatePdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("returns non-success partial state through the full route when one recipient fails", async () => {
    deliverEmailOnce
      .mockResolvedValueOnce({ messageId: "m-1" })
      .mockRejectedValueOnce(new Error("provider unavailable"));

    const response = await post();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      state: "PARTIALLY_DELIVERED",
      sent: 1,
      failed: 1,
      total: 2,
    });
    expect(deliverEmailOnce).toHaveBeenCalledTimes(2);
  });

  it("returns 502 through the full route when every recipient fails", async () => {
    deliverEmailOnce.mockRejectedValue(new Error("provider unavailable"));

    const response = await post();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      success: false,
      state: "DELIVERY_FAILED_OR_UNRESOLVED",
      sent: 0,
      failed: 2,
      total: 2,
    });
  });

  it("reports success through the full route only when every recipient is confirmed", async () => {
    deliverEmailOnce.mockResolvedValue({ messageId: "confirmed" });

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      state: "DELIVERED",
      sent: 2,
      failed: 0,
      total: 2,
    });
  });

  it("retries the same request key after partial delivery without re-sending a confirmed recipient", async () => {
    const confirmed = new Map<string, string>();
    let failSecondOnce = true;
    sendSignedFormEmail.mockImplementation(async ({ recipientEmail }) => {
      if (recipientEmail === "two@example.com" && failSecondOnce) {
        failSecondOnce = false;
        throw new Error("provider rejected first attempt");
      }
      return { data: { id: `provider-${recipientEmail}` } };
    });
    deliverEmailOnce.mockImplementation(async (input) => {
      const prior = confirmed.get(input.idempotencyKey);
      if (prior) return { messageId: prior, replayed: true };
      const result = await input.send();
      const id = result.data.id;
      confirmed.set(input.idempotencyKey, id);
      return { messageId: id, replayed: false };
    });

    const first = await post();
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({ sent: 1, failed: 1 });

    const retry = await post();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ sent: 2, failed: 0 });
    expect(sendSignedFormEmail).toHaveBeenCalledTimes(3);
    expect(
      sendSignedFormEmail.mock.calls.filter(
        ([input]) => input.recipientEmail === "one@example.com",
      ),
    ).toHaveLength(1);
  });
});
