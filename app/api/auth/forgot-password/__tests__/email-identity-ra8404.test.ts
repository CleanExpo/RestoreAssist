/**
 * RA-8404 — the reset code goes to the address the person typed
 * (canonicalised), not to an HTML-encoded copy no mailbox owns.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  deliverEmailOnce: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => h.userFindUnique(...args) } },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/password-reset-store", () => ({
  generateResetCode: () => "123456",
  storeResetCode: vi.fn(async () => ({ id: "v-1", expiresAt: new Date("2026-11-17T00:00:00Z") })),
}));
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn(async () => ({ data: { id: "p-1" }, error: null })),
}));
vi.mock("@/lib/email-delivery-ledger", () => ({
  deliverEmailOnce: (...args: unknown[]) => h.deliverEmailOnce(...args),
}));
vi.mock("@/lib/security-audit", () => ({
  extractRequestContext: () => ({}),
  logSecurityEvent: vi.fn(async () => undefined),
}));

import { POST } from "../route";

const STORED = "sean.o'brien@acme-restoration.com.au";

function request(email: string) {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.userFindUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
    where.email === STORED
      ? { id: "user-1", email: STORED, name: "Sean", password: "hash" }
      : null,
  );
  h.deliverEmailOnce.mockResolvedValue({ messageId: "p-1", replayed: false });
});

describe("RA-8404 forgot-password with an apostrophe address", () => {
  it("looks up and emails the address as typed", async () => {
    const res = await POST(request("Sean.O'Brien@acme-restoration.com.au"));
    expect(res.status).toBe(200);
    expect(h.userFindUnique.mock.calls[0][0].where.email).toBe(STORED);
    expect(h.deliverEmailOnce).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: STORED }),
    );
  });

  it("refuses markup in the address with 400 and looks nothing up", async () => {
    const res = await POST(request("<b>x</b>@acme-restoration.com.au"));
    expect(res.status).toBe(400);
    expect(h.userFindUnique).not.toHaveBeenCalled();
  });
});
