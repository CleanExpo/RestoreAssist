import { describe, it, expect } from "vitest";
import {
  initialsFor,
  isRegistryVerifiable,
  selectPublicCertifications,
  type CertificationInput,
} from "../technician-identity";

const NOW = new Date("2026-09-01T00:00:00Z");

function cert(over: Partial<CertificationInput> = {}): CertificationInput {
  return {
    certificationType: "IICRC_WRT",
    certificationName: "Water Damage Restoration Technician",
    issuingBody: "IICRC",
    certificationNumber: "WRT-123456",
    expiryDate: new Date("2027-01-01T00:00:00Z"),
    verificationStatus: "VERIFIED",
    ...over,
  };
}

describe("selectPublicCertifications", () => {
  it("shows a verified, unexpired certification with its number", () => {
    const out = selectPublicCertifications([cert()], NOW);

    expect(out).toHaveLength(1);
    expect(out[0].certificationNumber).toBe("WRT-123456");
  });

  // A PENDING certification is an unproven claim. A homeowner cannot tell it
  // apart from a checked one, so showing it reads as verification that has not
  // happened.
  it.each(["PENDING", "REJECTED", "EXPIRED", "RENEWAL_NEEDED"])(
    "hides a %s certification entirely",
    (verificationStatus) => {
      const out = selectPublicCertifications(
        [cert({ verificationStatus })],
        NOW,
      );

      expect(out).toEqual([]);
    },
  );

  // Nothing rewrites verificationStatus on a timer, so a row can sit at VERIFIED
  // while its expiry passes. Trusting the status alone would present a lapsed
  // credential as current — the exact misrepresentation this card exists to
  // avoid.
  it("hides a VERIFIED certification whose expiry has passed", () => {
    const out = selectPublicCertifications(
      [
        cert({
          verificationStatus: "VERIFIED",
          expiryDate: new Date("2026-08-31T23:59:00Z"),
        }),
      ],
      NOW,
    );

    expect(out).toEqual([]);
  });

  it("keeps a certification with no expiry date", () => {
    const out = selectPublicCertifications([cert({ expiryDate: null })], NOW);

    expect(out).toHaveLength(1);
  });

  // Policy numbers, not registry numbers. The client is told the cover is held
  // and current without being handed the account identifier.
  it.each([
    "INSURANCE_PUBLIC_LIABILITY",
    "INSURANCE_PROFESSIONAL_INDEMNITY",
    "INSURANCE_WORKERS_COMP",
  ])("redacts the number on %s but still lists it", (certificationType) => {
    const out = selectPublicCertifications(
      [
        cert({
          certificationType,
          certificationName: "Public Liability",
          certificationNumber: "POL-99887766",
        }),
      ],
      NOW,
    );

    expect(out).toHaveLength(1);
    expect(out[0].certificationNumber).toBeNull();
    expect(out[0].certificationName).toBe("Public Liability");
  });

  it("keeps the number on trade and business credentials", () => {
    const out = selectPublicCertifications(
      [
        cert({ certificationType: "TRADE_PLUMBING", certificationNumber: "PL-1" }),
        cert({
          certificationType: "BUSINESS_ABN_REGISTRATION",
          certificationNumber: "53004085616",
        }),
      ],
      NOW,
    );

    expect(out.map((c) => c.certificationNumber)).toEqual([
      "PL-1",
      "53004085616",
    ]);
  });
});

describe("isRegistryVerifiable", () => {
  it("is false for every INSURANCE_ type and true otherwise", () => {
    expect(isRegistryVerifiable("INSURANCE_PUBLIC_LIABILITY")).toBe(false);
    expect(isRegistryVerifiable("IICRC_AMRT")).toBe(true);
    expect(isRegistryVerifiable("OTHER")).toBe(true);
  });
});

describe("initialsFor", () => {
  it("takes first and last initials", () => {
    expect(initialsFor("Jane Smith")).toBe("JS");
    expect(initialsFor("Jane Anne Smith")).toBe("JS");
  });

  it("handles a single name and messy whitespace", () => {
    expect(initialsFor("Jane")).toBe("J");
    expect(initialsFor("  jane   smith  ")).toBe("JS");
  });

  it("never throws on an empty name", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });
});
