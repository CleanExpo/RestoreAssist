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
};

afterEach(() => {
  for (const [k, v] of Object.entries({
    MAILTRAP_API_KEY: original.mailtrap,
    SENDER_EMAIL: original.sender,
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

  it("resolves Mailtrap + SENDER_EMAIL as the only platform provider", async () => {
    process.env.MAILTRAP_API_KEY = "mt_test";
    process.env.SENDER_EMAIL = "support@restoreassist.app";

    const cfg = await resolvePlatformEmailConfig();
    expect(cfg).toMatchObject({
      provider: "mailtrap",
      apiKey: "mt_test",
      from: "RestoreAssist <support@restoreassist.app>",
      source: "platform",
    });
    expect(isEmailServiceConfigured()).toBe(true);
  });

  it("returns null when Mailtrap is unset", async () => {
    delete process.env.MAILTRAP_API_KEY;
    process.env.SENDER_EMAIL = "support@restoreassist.app";

    const cfg = await resolvePlatformEmailConfig();
    expect(cfg).toBeNull();
    expect(isEmailServiceConfigured()).toBe(false);
  });

  it("ignores leftover org BYOK Resend keys", async () => {
    process.env.MAILTRAP_API_KEY = "mt_platform";
    process.env.SENDER_EMAIL = "support@restoreassist.app";
    p.organization.findUnique.mockResolvedValue({
      emailProvider: "RESEND",
      emailProviderEncryptedKey: "re_byok",
      emailFromAddress: "jobs@acme.test",
    });

    const cfg = await resolvePlatformEmailConfig("org_1");
    expect(cfg).toMatchObject({
      provider: "mailtrap",
      apiKey: "mt_platform",
      from: "RestoreAssist <support@restoreassist.app>",
      source: "platform",
    });
  });

  it("throws when SENDER_EMAIL is unset", () => {
    delete process.env.SENDER_EMAIL;
    expect(() => resolveFromAddress()).toThrow(/SENDER_EMAIL/);
  });
});
