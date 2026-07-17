import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/credential-vault", () => ({
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")),
}));

import { prisma } from "@/lib/prisma";
import { resolveResendConfig } from "@/lib/email/resolve-resend-config";

const findUnique = prisma.organization.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findUnique.mockReset();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});

describe("resolveResendConfig", () => {
  it("returns org BYOK when RESEND key is stored", async () => {
    findUnique.mockResolvedValue({
      emailProvider: "RESEND",
      emailProviderEncryptedKey: "enc:re_test",
      emailFromAddress: "jobs@acme.test",
    });
    process.env.RESEND_API_KEY = "re_platform";

    const cfg = await resolveResendConfig("org1");
    expect(cfg).toEqual({
      apiKey: "re_test",
      from: "jobs@acme.test",
      source: "byok",
    });
  });

  it("falls back to platform key", async () => {
    findUnique.mockResolvedValue(null);
    process.env.RESEND_API_KEY = "re_platform";
    process.env.RESEND_FROM_EMAIL = "RestoreAssist <noreply@send.restoreassist.app>";

    const cfg = await resolveResendConfig("org1");
    expect(cfg?.source).toBe("platform");
    expect(cfg?.apiKey).toBe("re_platform");
  });
});
