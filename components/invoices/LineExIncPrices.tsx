/**
 * RA-7896: every line item shows two prices, ex GST and inc GST.
 *
 * Presentational only. `amounts` is in integer cents and comes from the
 * invoice rule: `lineAmountsCents(...)` for a draft line, or the stored line
 * itself (`subtotal` ex GST, `total` inc GST) once saved. The inc-GST prices
 * therefore add up to the document total.
 */
export function LineExIncPrices({
  amounts,
  incGstPending,
  className = "text-slate-900 dark:text-white",
}: {
  amounts: { subtotal: number; total: number };
  /** Shown instead of the inc-GST price while the GST rate is not yet known. */
  incGstPending?: string;
  className?: string;
}) {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  return (
    <dl className={`space-y-0.5 text-sm ${className}`}>
      <div className="flex justify-between gap-2">
        <dt className="text-xs opacity-70">Ex GST</dt>
        <dd className="tabular-nums">{dollars(amounts.subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-xs opacity-70">Inc GST</dt>
        <dd className="font-medium tabular-nums">
          {incGstPending ?? dollars(amounts.total)}
        </dd>
      </div>
    </dl>
  );
}
