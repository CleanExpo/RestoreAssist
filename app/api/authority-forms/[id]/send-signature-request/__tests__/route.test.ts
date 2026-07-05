/**
 * RA-6966 — POST /api/authority-forms/[id]/send-signature-request IDOR.
 *
 * The read (findUnique) and the mutation (update) both keyed only by the
 * client-supplied `signatureId`, ignoring the `formId` (instanceId) in the
 * URL. A caller with access to one form (form-1) could pass a foreign
 * signatureId belonging to another tenant's form (form-2) and the route
 * would happily mint a signature-request token, flip
 * signatureRequestSent=true, and email the token to the OTHER tenant's
 * signatory — all authorised only by the caller's ownership of form-1.
 *
 * Fix scopes both the read and the write by `{ id: signatureId, instanceId:
 * formId }` — a findFirst for the read (404 if null) and an updateMany for
 * the write (404 on count===0). Mirrors the sibling fix at
 * app/api/authority-forms/[id]/signatures/route.ts (RA-6961).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const withIdempotency = vi.fn();
const instanceFindUnique = vi.fn();
const instanceUpdate = vi.fn();
const signatureFindFirst = vi.fn();
const signatureUpdateMany = vi.fn();
const emailSend = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (...args: unknown[]) => withIdempotency(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormInstance: {
      findUnique: (...args: unknown[]) => instanceFindUnique(...args),
      update: (...args: unknown[]) => instanceUpdate(...args),
    },
    authorityFormSignature: {
      findFirst: (...args: unknown[]) => signatureFindFirst(...args),
      updateMany: (...args: unknown[]) => signatureUpdateMany(...args),
    },
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => emailSend(...args) };
  },
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost/api/authority-forms/form-1/send-signature-request",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}
const params = () => ({ params: Promise.resolve({ id: "form-1" }) });

const ownedForm = {
  id: "form-1",
  status: "PENDING_SIGNATURES",
  clientName: "Client One",
  clientAddress: "1 Test St",
  companyName: "RestoreAssist",
  template: { name: "Authority to Commence Work" },
  report: {
    userId: "user-1",
    assignedManagerId: null,
    assignedAdminId: null,
  },
};

beforeEach(() => {
  process.env.RESEND_API_KEY = "test-key";
  getServerSession.mockReset();
  withIdempotency.mockReset();
  instanceFindUnique.mockReset();
  instanceUpdate.mockReset();
  signatureFindFirst.mockReset();
  signatureUpdateMany.mockReset();
  emailSend.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  withIdempotency.mockImplementation(
    async (
      req: Request,
      _userId: string,
      fn: (rawBody: string) => Promise<Response>,
    ) => fn(await req.text()),
  );
  instanceFindUnique.mockResolvedValue(ownedForm);
  emailSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
});

describe("POST /api/authority-forms/[id]/send-signature-request", () => {
  it("sends a signature request for a signature that belongs to the caller's form", async () => {
    const ownSignature = {
      id: "sig-1",
      instanceId: "form-1",
      signatoryName: "Jane Client",
      signatoryEmail: "jane@example.com",
      signedAt: null,
    };
    signatureFindFirst.mockResolvedValueOnce(ownSignature);
    signatureUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(
      makeRequest({ signatureId: "sig-1" }),
      params(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    expect(signatureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sig-1", instanceId: "form-1" },
      }),
    );
    expect(signatureUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sig-1", instanceId: "form-1" },
      }),
    );
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(emailSend.mock.calls[0][0]).toMatchObject({
      to: "jane@example.com",
    });
  });

  it("RA-6966: a signatureId belonging to another tenant's form returns 404, mutates nothing, and sends no email", async () => {
    // The signature exists in the DB, but its instanceId is "form-2" — a
    // different form than the one the caller owns ("form-1"). The scoped
    // findFirst must return null (Prisma's compound where excludes it).
    signatureFindFirst.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ signatureId: "sig-belongs-to-form-2" }),
      params(),
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");

    // The read itself was scoped to the caller's form.
    expect(signatureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sig-belongs-to-form-2", instanceId: "form-1" },
      }),
    );

    // Nothing downstream ran: no token mutation, no status write, no email.
    expect(signatureUpdateMany).not.toHaveBeenCalled();
    expect(instanceUpdate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("defence in depth: a zero-count updateMany (race between read and write) also 404s and sends no email", async () => {
    const ownSignature = {
      id: "sig-1",
      instanceId: "form-1",
      signatoryName: "Jane Client",
      signatoryEmail: "jane@example.com",
      signedAt: null,
    };
    signatureFindFirst.mockResolvedValueOnce(ownSignature);
    signatureUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(
      makeRequest({ signatureId: "sig-1" }),
      params(),
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("escapes HTML in tenant-controlled fields before interpolating them into the email body", async () => {
    // Every field below is user/tenant-controlled and reaches the email HTML.
    // Without escaping, the <script>/<img> payloads would render as live
    // markup in a legally-significant client-facing email (HTML injection).
    instanceFindUnique.mockResolvedValueOnce({
      ...ownedForm,
      companyName: '<script>alert("company")</script>',
      clientName: '<img src=x onerror=alert(1)>',
      clientAddress: '"><b>injected</b>',
      template: { name: "<h1>form & name</h1>" },
    });
    signatureFindFirst.mockResolvedValueOnce({
      id: "sig-1",
      instanceId: "form-1",
      signatoryName: "<script>alert('name')</script>",
      signatoryEmail: "jane@example.com",
      signedAt: null,
    });
    signatureUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(makeRequest({ signatureId: "sig-1" }), params());
    expect(res.status).toBe(200);

    expect(emailSend).toHaveBeenCalledTimes(1);
    const html = (emailSend.mock.calls[0][0] as { html: string }).html;

    // No raw payload markup survived into the body.
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>injected</b>");
    expect(html).not.toContain("<h1>form & name</h1>");

    // The payloads are present, but entity-escaped.
    expect(html).toContain("&lt;script&gt;alert(&quot;company&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&quot;&gt;&lt;b&gt;injected&lt;/b&gt;");
    expect(html).toContain("&lt;h1&gt;form &amp; name&lt;/h1&gt;");
    expect(html).toContain("&lt;script&gt;alert(&#039;name&#039;)&lt;/script&gt;");
  });

  it("403 when the caller has no relationship to the form", async () => {
    instanceFindUnique.mockResolvedValueOnce({
      ...ownedForm,
      report: {
        userId: "someone-else",
        assignedManagerId: null,
        assignedAdminId: null,
      },
    });

    const res = await POST(
      makeRequest({ signatureId: "sig-1" }),
      params(),
    );

    expect(res.status).toBe(403);
    expect(signatureFindFirst).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });
});
