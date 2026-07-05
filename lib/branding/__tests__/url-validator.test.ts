import { describe, expect, it } from "vitest";
import { isPublicHttpUrl } from "../url-validator";

describe("isPublicHttpUrl", () => {
  // ── Valid public URLs ────────────────────────────────────────────────────────

  it("accepts a public https URL", () => {
    const result = isPublicHttpUrl("https://example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.hostname).toBe("example.com");
  });

  it("accepts a public http URL", () => {
    const result = isPublicHttpUrl("http://example.com/path?q=1");
    expect(result.ok).toBe(true);
  });

  it("accepts a URL with a subdomain", () => {
    const result = isPublicHttpUrl(
      "https://cdn.acme-restoration.com.au/logo.png",
    );
    expect(result.ok).toBe(true);
  });

  // ── Scheme blocking ──────────────────────────────────────────────────────────

  it("rejects file:// scheme", () => {
    const result = isPublicHttpUrl("file:///etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Only http(s) URLs allowed");
  });

  it("rejects ftp:// scheme", () => {
    const result = isPublicHttpUrl("ftp://files.example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Only http(s) URLs allowed");
  });

  // ── Loopback ─────────────────────────────────────────────────────────────────

  it("rejects localhost", () => {
    const result = isPublicHttpUrl("http://localhost:5432/");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe("Loopback addresses not allowed");
  });

  it("rejects 127.0.0.1", () => {
    const result = isPublicHttpUrl("http://127.0.0.1:8080/admin");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe("Loopback addresses not allowed");
  });

  it("rejects the whole 127.0.0.0/8 loopback block", () => {
    const result = isPublicHttpUrl("http://127.1.2.3/");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe("Loopback addresses not allowed");
  });

  // ── Link-local / metadata ────────────────────────────────────────────────────

  it("rejects AWS metadata endpoint (169.254.169.254)", () => {
    const result = isPublicHttpUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe("Link-local addresses not allowed");
  });

  // ── RFC1918 private ranges ───────────────────────────────────────────────────

  it("rejects 10.x.x.x", () => {
    const result = isPublicHttpUrl("http://10.0.0.1/internal");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Private IP ranges not allowed");
  });

  it("rejects 192.168.x.x", () => {
    const result = isPublicHttpUrl("http://192.168.1.1/router");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Private IP ranges not allowed");
  });

  it("rejects 172.16.x.x (RFC1918 middle range)", () => {
    const result = isPublicHttpUrl("http://172.16.0.1/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Private IP ranges not allowed");
  });

  // ── IPv6 private / link-local ────────────────────────────────────────────────

  it("rejects IPv6 unique-local (fd00::/8)", () => {
    const result = isPublicHttpUrl("http://[fd00::1]/");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe(
        "IPv6 private/link-local addresses not allowed",
      );
  });

  it("rejects IPv6 link-local (fe80::/10)", () => {
    const result = isPublicHttpUrl("http://[fe80::1]/");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe(
        "IPv6 private/link-local addresses not allowed",
      );
  });

  // ── Internal hostnames ───────────────────────────────────────────────────────

  it("rejects a *.internal hostname", () => {
    const result = isPublicHttpUrl("http://vault.internal/secret");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe("Internal hostnames not allowed");
  });

  // ── Broadcast ────────────────────────────────────────────────────────────────

  it("rejects 0.0.0.0", () => {
    const result = isPublicHttpUrl("http://0.0.0.0/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Broadcast address not allowed");
  });

  // ── Malformed ────────────────────────────────────────────────────────────────

  it("rejects a non-URL string", () => {
    const result = isPublicHttpUrl("not-a-url");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Invalid URL");
  });
});
