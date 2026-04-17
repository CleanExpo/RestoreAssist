/**
 * GST Rules — single source of truth for AU / NZ tax treatment.
 *
 * AU: GST 10%  (GSTR 2013/1)
 * NZ: GST 15%  (GST Act 1985 s.10)
 *
 * Upstream country source: Organization.country (RA-1120)
 */

export type Country = "AU" | "NZ";

export type GstTreatment = {
  country: Country;
  rate: 0.1 | 0.15;
  percentLabel: "10%" | "15%";
  /** Xero tax type — NZ realms use OUTPUT2 for 15% GST */
  xeroTaxType: "OUTPUT" | "OUTPUT2";
  /** MYOB tax code — AU: "GST", NZ: "GST15" */
  myobTaxCode: string;
  /** QuickBooks Online tax rate name — AU: "GST", NZ: "GST NZ" */
  qboTaxRateName: string;
};

export function getGstTreatment(country: Country): GstTreatment {
  if (country === "NZ") {
    return {
      country: "NZ",
      rate: 0.15,
      percentLabel: "15%",
      xeroTaxType: "OUTPUT2",
      myobTaxCode: "GST15",
      qboTaxRateName: "GST NZ",
    };
  }
  return {
    country: "AU",
    rate: 0.1,
    percentLabel: "10%",
    xeroTaxType: "OUTPUT",
    myobTaxCode: "GST",
    qboTaxRateName: "GST",
  };
}

/**
 * Compute GST amount in cents (cents in → cents out).
 * For dollar-unit callers, divide input by 100 before calling and multiply result by 100 after.
 */
export function computeGstCents(
  subtotalCents: number,
  country: Country,
): number {
  return Math.round(subtotalCents * getGstTreatment(country).rate);
}
