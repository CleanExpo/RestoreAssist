/**
 * Wave 4 (W4-2) — job-level margin snapshot (estimate vs invoice).
 */

export type JobMarginInput = {
  costEstimates: Array<{ category: string; subtotal: number }>;
  /** Invoice subtotal excluding GST, in dollars (not cents). */
  invoicedSubtotalExGst: number | null;
};

export type JobMarginSnapshot = {
  labourExGst: number;
  equipmentExGst: number;
  materialsExGst: number;
  otherExGst: number;
  estimateTotalExGst: number;
  invoicedSubtotalExGst: number | null;
  marginExGst: number | null;
  marginPercent: number | null;
};

function sumCategory(
  items: JobMarginInput["costEstimates"],
  pattern: RegExp,
): number {
  return items
    .filter((i) => pattern.test(i.category))
    .reduce((s, i) => s + i.subtotal, 0);
}

export function computeJobMargin(input: JobMarginInput): JobMarginSnapshot {
  const labourExGst = sumCategory(input.costEstimates, /labor|labour/i);
  const equipmentExGst = sumCategory(
    input.costEstimates,
    /equip|dehu|air|afd/i,
  );
  const materialsExGst = sumCategory(
    input.costEstimates,
    /material|chemical|consumable/i,
  );
  const estimateTotalExGst = input.costEstimates.reduce(
    (s, i) => s + i.subtotal,
    0,
  );
  const otherExGst = Math.max(
    0,
    estimateTotalExGst - labourExGst - equipmentExGst - materialsExGst,
  );

  const invoiced = input.invoicedSubtotalExGst;
  const marginExGst =
    invoiced != null ? invoiced - estimateTotalExGst : null;
  const marginPercent =
    invoiced != null && invoiced > 0 && marginExGst != null
      ? (marginExGst / invoiced) * 100
      : null;

  return {
    labourExGst,
    equipmentExGst,
    materialsExGst,
    otherExGst,
    estimateTotalExGst,
    invoicedSubtotalExGst: invoiced,
    marginExGst,
    marginPercent,
  };
}