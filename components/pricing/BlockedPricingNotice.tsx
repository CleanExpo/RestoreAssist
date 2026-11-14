/**
 * RA-8281 (B2): how every screen shows a blocked pricing result.
 *
 * Each line of the estimate, quote or document is listed. A line whose
 * price-list rate is not set reads "Rate not set" and has no amount. The
 * total reads "Total not available: rate not set". No NRPG range figure is
 * ever shown here (founder rule, 2026-11-12).
 */
import Link from "next/link";
import { RAIcon } from "@/components/brand/RAIcon";
import {
  RATE_NOT_SET_LABEL,
  type BlockedPricing,
  type BlockedPricingLine,
} from "@/lib/pricing/blocked-line";

const NOT_SHOWN = "—";

function money(value: number | null): string {
  return value === null ? NOT_SHOWN : `$${value.toFixed(2)}`;
}

function quantity(line: BlockedPricingLine): string {
  if (line.quantity === null) return NOT_SHOWN;
  return line.unit ? `${line.quantity} ${line.unit}` : String(line.quantity);
}

function rateCell(line: BlockedPricingLine): string {
  if (line.pricingStatus === "rate_not_set") {
    return RATE_NOT_SET_LABEL;
  }
  if (line.pricingStatus === "unusable_line") {
    return line.pricingNote ?? "Cannot be priced";
  }
  return money(line.rate);
}

export function BlockedPricingNotice({
  blocked,
  title,
}: {
  blocked: BlockedPricing;
  /** What was being priced, e.g. "Cost estimate". */
  title: string;
}) {
  // A rate is fixed in the price list; a saved equipment line that cannot be
  // read is fixed on the equipment selection. Each gets its own instruction.
  const ratesNotSet = blocked.lines.some(
    (line) => line.pricingStatus === "rate_not_set",
  );
  const unusableLines = blocked.lines.some(
    (line) => line.pricingStatus === "unusable_line",
  );
  return (
    <section
      role="alert"
      aria-label={`${title}: ${blocked.totalNote}`}
      data-testid="blocked-pricing"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="mb-3 flex items-start gap-2">
        <RAIcon name="warning" size={18} decorative className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">
            {title}: {blocked.totalNote}
          </p>
          <div data-testid="blocked-pricing-instructions">
            {(ratesNotSet || !unusableLines) && (
              <p>
                Set the rates marked below in your{" "}
                <Link href="/dashboard/pricing-config" className="underline">
                  price list
                </Link>
                .
              </p>
            )}
            {unusableLines && (
              <p>
                Correct the saved equipment lines marked below: each needs an
                equipment type and a whole-number quantity.
              </p>
            )}
            <p>Then generate it again. Nothing has been saved.</p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-amber-300 dark:border-amber-500/40">
              <th scope="col" className="py-1 pr-3 font-medium">
                Line
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Quantity
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Rate
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {blocked.lines.map((line, index) => {
              const isBlocked = line.pricingStatus !== "priced";
              return (
                <tr
                  key={`${index}-${line.description}`}
                  data-pricing-status={line.pricingStatus}
                  className="border-b border-amber-200/70 align-top dark:border-amber-500/20"
                >
                  <td className="py-1 pr-3">{line.description}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {quantity(line)}
                  </td>
                  <td className={`py-1 pr-3 ${isBlocked ? "font-semibold" : ""}`}>
                    {rateCell(line)}
                  </td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {isBlocked ? NOT_SHOWN : money(line.subtotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="pt-2 pr-3 font-semibold">
                Total
              </th>
              <td className="pt-2 text-right font-semibold">
                {blocked.totalNote}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
