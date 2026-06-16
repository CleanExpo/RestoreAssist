import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { encrypt, decrypt } from "../credential-vault";

// 32-byte key passed as keyOverride so the test never touches process.env.
const key = crypto.createHash("sha256").update("test-key-material").digest();

describe("credential-vault AES-256-GCM (B-tests)", () => {
  it("round-trips plaintext and never stores it in the clear", () => {
    const ciphertext = encrypt("sk-secret-value", key);
    expect(ciphertext).not.toContain("sk-secret-value");
    expect(ciphertext.split(":")).toHaveLength(3); // iv:authTag:ciphertext
    expect(decrypt(ciphertext, key)).toBe("sk-secret-value");
  });

  it("fails closed when the auth tag is tampered (GCM integrity)", () => {
    const [iv, tag, data] = encrypt("sk-secret-value", key).split(":");
    const forgedTag = "0".repeat(tag.length);
    expect(() => decrypt(`${iv}:${forgedTag}:${data}`, key)).toThrow();
  });

  it("fails to decrypt with the wrong key", () => {
    const ciphertext = encrypt("sk-secret-value", key);
    const wrongKey = crypto.createHash("sha256").update("other").digest();
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});
