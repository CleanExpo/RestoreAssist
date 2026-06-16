import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const decrypt = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    providerConnection: {
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));
vi.mock("../../credential-vault", () => ({
  encrypt: vi.fn(),
  decrypt: (...args: unknown[]) => decrypt(...args),
}));

import { getProviderApiKey, maskApiKey } from "../provider-connections";

beforeEach(() => {
  findUnique.mockReset();
  decrypt.mockReset();
});

describe("getProviderApiKey gating (B-tests)", () => {
  it("returns the decrypted key for an ACTIVE connection", async () => {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockReturnValue(JSON.stringify({ apiKey: "sk-real-key" }));
    expect(await getProviderApiKey("ws_1", "ANTHROPIC")).toBe("sk-real-key");
  });

  it("returns null (and never decrypts) for a DISABLED connection", async () => {
    findUnique.mockResolvedValue({
      status: "DISABLED",
      encryptedCredentials: "blob",
    });
    expect(await getProviderApiKey("ws_1", "ANTHROPIC")).toBeNull();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("returns null when no connection exists", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getProviderApiKey("ws_1", "OPENAI")).toBeNull();
  });

  it("fails closed (null) when decryption throws", async () => {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockImplementation(() => {
      throw new Error("bad auth tag");
    });
    expect(await getProviderApiKey("ws_1", "GOOGLE")).toBeNull();
  });
});

describe("maskApiKey (B-tests)", () => {
  it("masks every character for short keys (<=14)", () => {
    expect(maskApiKey("shortkey")).toBe("•".repeat(8));
  });

  it("keeps exactly the first 10 and last 4, masking the middle", () => {
    const masked = maskApiKey("sk-ant-api03-ABCDEFGH"); // length 21
    expect(masked.startsWith("sk-ant-api")).toBe(true);
    expect(masked.endsWith("EFGH")).toBe(true);
    expect(masked).not.toContain("03-ABCD"); // middle is never exposed
  });
});
