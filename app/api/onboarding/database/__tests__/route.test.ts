import { afterAll, describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/credential-vault", () => ({
  encrypt: vi.fn(() => "ENC_BLOB"), // opaque — real AES output never echoes input
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/credential-vault";
import { POST } from "../route";

const mockEncrypt = encrypt as unknown as ReturnType<typeof vi.fn>;

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const ws = (prisma as unknown as {
  workspace: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
}).workspace;
const ORIGINAL_ALLOWLIST = process.env.TENANT_DATABASE_HOST_ALLOWLIST;
const ORIGINAL_PROVISIONING_FLAG = process.env.TENANT_DATABASE_PROVISIONING_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TENANT_DATABASE_HOST_ALLOWLIST = "h,*.supabase.co";
  process.env.TENANT_DATABASE_PROVISIONING_ENABLED = "true";
  mockSession.mockResolvedValue({ user: { id: "u1" } });
  ws.findFirst.mockResolvedValue({ id: "w1" });
});

afterAll(() => {
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.TENANT_DATABASE_HOST_ALLOWLIST;
  else process.env.TENANT_DATABASE_HOST_ALLOWLIST = ORIGINAL_ALLOWLIST;
  if (ORIGINAL_PROVISIONING_FLAG === undefined) {
    delete process.env.TENANT_DATABASE_PROVISIONING_ENABLED;
  } else {
    process.env.TENANT_DATABASE_PROVISIONING_ENABLED = ORIGINAL_PROVISIONING_FLAG;
  }
});

const post = (body: object) =>
  new NextRequest("http://localhost/api/onboarding/database", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/onboarding/database", () => {
  it("fails closed when the production scheduler contract is not enabled", async () => {
    process.env.TENANT_DATABASE_PROVISIONING_ENABLED = "false";
    const res = await POST(
      post({ connectionString: "postgres://u:p@h:5432/db?sslmode=verify-full" }),
    );
    expect(res.status).toBe(503);
    expect(ws.update).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    mockSession.mockResolvedValue(null);
    expect((await POST(post({ connectionString: "postgres://h/db" }))).status).toBe(401);
  });

  it("404s when the user owns no workspace", async () => {
    ws.findFirst.mockResolvedValue(null);
    expect((await POST(post({ connectionString: "postgres://h/db" }))).status).toBe(404);
  });

  it("400s on an invalid connection string and never writes", async () => {
    const res = await POST(post({ connectionString: "mysql://h/db" }));
    expect(res.status).toBe(400);
    expect(ws.update).not.toHaveBeenCalled();
  });

  it("400s on an unapproved database host and never writes", async () => {
    const res = await POST(
      post({ connectionString: "postgres://u:p@evil.test/db?sslmode=verify-full" }),
    );
    expect(res.status).toBe(400);
    expect(ws.update).not.toHaveBeenCalled();
  });

  it("stores the ENCRYPTED string + sets provisioning, returns 202", async () => {
    const connectionString = "postgres://u:p@h:5432/db?sslmode=verify-full";
    const res = await POST(post({ connectionString }));
    expect(res.status).toBe(202);
    expect(ws.update).toHaveBeenCalledTimes(1);
    const data = ws.update.mock.calls[0][0].data;
    expect(data.tenantDbStatus).toBe("provisioning");
    expect(data.tenantDbProvisionPhase).toBeNull();
    // Security: encrypt() is given the raw string; the STORED value is the
    // opaque blob, never the plaintext connection string.
    expect(mockEncrypt).toHaveBeenCalledWith(connectionString);
    expect(data.tenantDbConnectionEnc).toBe("ENC_BLOB");
    expect(JSON.stringify(data)).not.toContain("u:p@h");
  });

  it("clears a stale late-phase resume marker when the target is replaced", async () => {
    const res = await POST(
      post({ connectionString: "postgres://u:p@h:5432/replacement?sslmode=verify-full" }),
    );
    expect(res.status).toBe(202);
    expect(ws.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: expect.objectContaining({
        tenantDbStatus: "provisioning",
        tenantDbProvisionPhase: null,
      }),
    });
  });
});
