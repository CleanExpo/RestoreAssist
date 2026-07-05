import { afterEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import { isSafePublicHttpsUrl } from "../safe-external-url";

// SSRF regression suite for the shared PDF-logo fetch guard. The critical case
// is DNS rebinding: a benign-looking hostname that resolves to a metadata /
// private address must be rejected — the old string-only host check let it
// through because the hostname is not itself an IP literal.

function mockLookup(...addresses: { address: string; family: number }[]) {
  return vi
    .spyOn(dns.promises, "lookup")
    .mockResolvedValue(addresses as never);
}

describe("isSafePublicHttpsUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Scheme ──────────────────────────────────────────────────────────────────

  it("rejects http:// (https required)", async () => {
    const spy = mockLookup({ address: "93.184.216.34", family: 4 });
    expect(await isSafePublicHttpsUrl("http://example.com/logo.png")).toBe(
      false,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) schemes", async () => {
    expect(await isSafePublicHttpsUrl("file:///etc/passwd")).toBe(false);
    expect(await isSafePublicHttpsUrl("ftp://files.example.com/x")).toBe(false);
  });

  it("rejects a malformed URL", async () => {
    expect(await isSafePublicHttpsUrl("not-a-url")).toBe(false);
  });

  // ── IP-literal hosts (no DNS) ────────────────────────────────────────────────

  it("rejects the AWS metadata IP literal without a DNS lookup", async () => {
    const spy = mockLookup({ address: "1.2.3.4", family: 4 });
    expect(
      await isSafePublicHttpsUrl("https://169.254.169.254/latest/meta-data/"),
    ).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects loopback / RFC1918 IP literals", async () => {
    mockLookup({ address: "1.2.3.4", family: 4 });
    expect(await isSafePublicHttpsUrl("https://127.0.0.1/")).toBe(false);
    expect(await isSafePublicHttpsUrl("https://10.0.0.1/")).toBe(false);
    expect(await isSafePublicHttpsUrl("https://192.168.1.1/")).toBe(false);
    expect(await isSafePublicHttpsUrl("https://172.16.0.1/")).toBe(false);
    expect(await isSafePublicHttpsUrl("https://0.0.0.0/")).toBe(false);
  });

  it("rejects IPv6 loopback and link-local literals", async () => {
    expect(await isSafePublicHttpsUrl("https://[::1]/")).toBe(false);
    expect(await isSafePublicHttpsUrl("https://[fe80::1]/")).toBe(false);
    expect(await isSafePublicHttpsUrl("https://[fc00::1]/")).toBe(false);
  });

  // ── DNS rebinding (the core fix) ─────────────────────────────────────────────

  it("rejects a public hostname that resolves to the metadata IP", async () => {
    mockLookup({ address: "169.254.169.254", family: 4 });
    expect(await isSafePublicHttpsUrl("https://evil.example.com/logo.png")).toBe(
      false,
    );
  });

  it("rejects when ANY resolved address is private (mixed A records)", async () => {
    mockLookup(
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    );
    expect(await isSafePublicHttpsUrl("https://evil.example.com/logo.png")).toBe(
      false,
    );
  });

  it("rejects when DNS resolution fails (fail closed)", async () => {
    vi.spyOn(dns.promises, "lookup").mockRejectedValue(
      new Error("ENOTFOUND"),
    );
    expect(await isSafePublicHttpsUrl("https://nope.example.com/")).toBe(false);
  });

  // ── Legitimate public CDN logos still pass ───────────────────────────────────

  it("accepts a public https CDN logo", async () => {
    mockLookup({ address: "93.184.216.34", family: 4 });
    expect(
      await isSafePublicHttpsUrl("https://cdn.acme-restoration.com.au/logo.png"),
    ).toBe(true);
  });

  it("accepts a public IPv6 host", async () => {
    mockLookup({ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 });
    expect(await isSafePublicHttpsUrl("https://cdn.example.com/logo.png")).toBe(
      true,
    );
  });
});
