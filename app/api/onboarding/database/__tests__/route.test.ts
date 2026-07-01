import { describe, it, expect, vi, beforeEach } from "vitest";
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

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u1" } });
  ws.findFirst.mockResolvedValue({ id: "w1" });
});

const post = (body: object) =>
  new NextRequest("http://localhost/api/onboarding/database", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/onboarding/database", () => {
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

  it("stores the ENCRYPTED string + sets provisioning, returns 202", async () => {
    const res = await POST(post({ connectionString: "postgres://u:p@h:5432/db" }));
    expect(res.status).toBe(202);
    expect(ws.update).toHaveBeenCalledTimes(1);
    const data = ws.update.mock.calls[0][0].data;
    expect(data.tenantDbStatus).toBe("provisioning");
    // Security: encrypt() is given the raw string; the STORED value is the
    // opaque blob, never the plaintext connection string.
    expect(mockEncrypt).toHaveBeenCalledWith("postgres://u:p@h:5432/db");
    expect(data.tenantDbConnectionEnc).toBe("ENC_BLOB");
    expect(JSON.stringify(data)).not.toContain("u:p@h");
  });
});
