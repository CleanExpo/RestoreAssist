import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { organization: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/credential-vault", () => ({
  decrypt: (v: string) => v,
}));

import {
  formatFromAddress,
  isEmailServiceConfigured,
  parseFromAddress,
  resolveFromAddress,
  resolvePlatformEmailConfig,
} from "../resolve-platform-config";
import { prisma } from "@/lib/prisma";

const p = prisma as unknown as {
  organization: { findUnique: ReturnType<typeof vi.fn> };
};

const original = {
  mailtrap: process.env.MAILTRAP_API_KEY,
  sender: process.env.SENDER_EMAIL,
  resend: process.env.RESEND_API_KEY,
  resendFrom: process.env.RESEND_FROM_EMAIL,
};

afterEach(() => {
  for (const [k, v] of Object.entries({
    MAILTRAP_API_KEY: original.mailtrap,
    SENDER_EMAIL: original.sender,
    RESEND_API_KEY: original.resend,
    RESEND_FROM_EMAIL: original.resendFrom,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.clearAllMocks();
});

describe("resolve-platform-config", () => {
  it("formats plain SENDER_EMAIL with RestoreAssist display name", () => {
    expect(formatFromAddress("support@restoreassist.app")).toBe(
      "RestoreAssist <support@restoreassist.app>",
    );
  });

  it("parses Name <email> for Mailtrap from objects", () => {
    expect(parseFromAddress("RestoreAssist <support@restoreassist.app>")).toEqual(
      { email: "support@restoreassist.app", name: "RestoreAssist" },
    );
  });

  it("prefers Mailtrap + SENDER_EMAIL over Resend", async () => {
    process.env.MAILTRAP_API_KEY = "mt_test";
    process.env.SENDER_EMAIL = "support@restoreassist.app";
    process.env.RESEND_API_KEY = "re_should_not_win";
    process.env.RESEND_FROM_EMAIL = "other@example.com";

    const cfg = await resolvePlatformEmailConfig();
    expect(cfg).toMatchObject({
      provider: "mailtrap",
      apiKey: "mt_test",
      from: "RestoreAssist <support@restoreassist.app>",
      source: "platform",
    });
    expect(isEmailServiceConfigured()).toBe(true);
  });

  it("falls back to Resend when Mailtrap is unset", async () => {
    delete process.env.MAILTRAP_API_KEY;
    delete process.env.SENDER_EMAIL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "RestoreAssist <noreply@restoreassist.app>";

    const cfg = await resolvePlatformEmailConfig();
    expect(cfg?.provider).toBe("resend");
    expect(resolveFromAddress()).toContain("noreply@restoreassist.app");
  });

  it("prefers org BYOK Resend over platform Mailtrap", async () => {
    process.env.MAILTRAP_API_KEY = "mt_platform";
    process.env.SENDER_EMAIL = "support@restoreassist.app";
    p.organization.findUnique.mockResolvedValue({
      emailProvider: "RESEND",
      emailProviderEncryptedKey: "re_byok",
      emailFromAddress: "jobs@acme.test",
    });

    const cfg = await resolvePlatformEmailConfig("org_1");
    expect(cfg).toMatchObject({
      provider: "resend",
      apiKey: "re_byok",
      from: "RestoreAssist <jobs@acme.test>",
      source: "byok",
    });
  });

  it("throws when no sender is configured", () => {
    delete process.env.SENDER_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    expect(() => resolveFromAddress()).toThrow(/SENDER_EMAIL/);
  });
});
