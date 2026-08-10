/** A signed bearer link was generated. This is not evidence it was delivered. */
export const REPORT_INSURER_LINK_GENERATED_ACTION =
  "REPORT_INSURER_LINK_GENERATED" as const;

/** Existing audit actions that prove a report was actually sent or delivered. */
export const REPORT_DELIVERY_EVIDENCE_ACTIONS = [
  "REPORT_SENT",
  "REPORT_DELIVERED",
] as const;
