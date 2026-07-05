import { describe, it, expect, vi, afterEach } from "vitest";
import dns from "node:dns";
import {
  sanitise,
  fmtDate,
  fmtCurrency,
  generateIICRCReportPDF,
} from "../generate-iicrc-report-pdf";

// RA-6687: Focused unit tests for the PURE, DB-free helpers that shape and
// format report data before it is drawn into the IICRC S500:2021 PDF. These
// helpers guard against user-supplied text crashing pdf-lib and ensure
// Australian-locale date/currency formatting in the client-facing report.

describe("sanitise", () => {
  it("returns empty string for null / undefined", () => {
    expect(sanitise(null)).toBe("");
    expect(sanitise(undefined)).toBe("");
  });

  it("collapses newlines, tabs and carriage returns to single spaces", () => {
    expect(sanitise("line1\nline2\r\nline3\tcol")).toBe("line1 line2 line3 col");
  });

  it("strips characters outside printable ASCII + Latin-1 supplement", () => {
    // Emoji and other non-WinAnsi glyphs would throw in pdf-lib drawText.
    expect(sanitise("Café 🚰 résumé")).toBe("Café  résumé");
  });

  it("preserves Latin-1 supplement characters (e.g. accented vowels, ©)", () => {
    expect(sanitise("naïve © Zürich")).toBe("naïve © Zürich");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitise("   padded   ")).toBe("padded");
  });

  it("coerces non-string values to string", () => {
    expect(sanitise(12345)).toBe("12345");
    expect(sanitise(0)).toBe("0");
  });
});

describe("fmtDate", () => {
  it("returns an em dash for falsy input", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDate("")).toBe("—");
  });

  it("formats a Date in Australian long-date style (DD Month YYYY)", () => {
    // 2025-03-07 -> "07 March 2025" in en-AU.
    const out = fmtDate(new Date("2025-03-07T00:00:00Z"));
    expect(out).toContain("March");
    expect(out).toContain("2025");
    expect(out).toMatch(/^\d{2} March 2025$/);
  });

  it("accepts an ISO date string", () => {
    const out = fmtDate("2024-12-25");
    expect(out).toContain("December");
    expect(out).toContain("2024");
  });

  it("renders 'Invalid Date' for an unparseable date string", () => {
    // toLocaleDateString does not throw on an Invalid Date — it returns the
    // string "Invalid Date" — so the em-dash catch branch is reserved for
    // genuine throws. Documenting actual behaviour rather than refactoring
    // production code (RA-6687 scope).
    expect(fmtDate("not-a-date")).toBe("Invalid Date");
  });
});

describe("fmtCurrency", () => {
  it("returns an em dash for null / undefined", () => {
    expect(fmtCurrency(null)).toBe("—");
    expect(fmtCurrency(undefined)).toBe("—");
  });

  it("formats a number as AUD currency", () => {
    const out = fmtCurrency(1234.5);
    // en-AU AUD renders as "$1,234.50" with a leading dollar sign.
    expect(out).toContain("1,234.50");
    expect(out).toContain("$");
  });

  it("formats zero (not falsy) as a currency amount, not a dash", () => {
    expect(fmtCurrency(0)).not.toBe("—");
    expect(fmtCurrency(0)).toContain("0.00");
  });

  it("formats negative amounts", () => {
    expect(fmtCurrency(-50)).toContain("50.00");
  });
});

describe("generateIICRCReportPDF — logo SSRF gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The cover-header logo is fetched server-side from a user-controlled
  // theme.logoUrl. A bare startsWith("https://") check let an https URL
  // pointing at an internal / metadata host through (SSRF). The fetch is now
  // gated by isSafePublicHttpsUrl, which requires https and resolves the host,
  // rejecting loopback / link-local / RFC1918 / metadata addresses (including
  // via DNS rebinding). These tests assert the gate at the call site.

  it("does NOT fetch a logo from a private / metadata https host", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Uint8Array()));

    await generateIICRCReportPDF(
      { id: "ssrf-block-test" },
      {
        theme: {
          logoUrl: "https://169.254.169.254/latest/meta-data/",
          primaryColor: "1C2E47",
        },
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT fetch a logo from an https loopback host", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Uint8Array()));

    await generateIICRCReportPDF(
      { id: "ssrf-loopback-test" },
      {
        theme: {
          logoUrl: "https://127.0.0.1/logo.png",
          primaryColor: "1C2E47",
        },
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DOES fetch a logo from a public https host", async () => {
    // Resolve the host to a public address so the SSRF gate passes.
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // Non-ok response so it falls back to the text header without needing
      // real image bytes — we only assert the fetch was attempted.
      .mockResolvedValue(new Response(null, { status: 404 }));

    await generateIICRCReportPDF(
      { id: "ssrf-allow-test" },
      {
        theme: {
          logoUrl: "https://cdn.example.com/logo.png",
          primaryColor: "1C2E47",
        },
      },
    );

    expect(fetchSpy).toHaveBeenCalledWith("https://cdn.example.com/logo.png");
  });
});
