"use client";

interface TotalsBarProps {
  totals: any;
}

const formatCurrency = (cents: number) =>
  (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2
  });

export default function TotalsBar({ totals }: TotalsBarProps) {
  if (!totals || !totals.summary_cents) {
    return null;
  }

  const s = totals.summary_cents;

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Live Totals</h2>
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex flex-col">
          <span className="text-gray-600 text-xs">Subtotal</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(s.subtotal)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600 text-xs">Overhead</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(s.overhead)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600 text-xs">Profit</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(s.profit)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600 text-xs">Contingency</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(s.contingency)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600 text-xs">GST</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(s.gst)}
          </span>
        </div>
        <div className="flex flex-col border-l-2 border-gray-300 pl-4">
          <span className="text-gray-600 text-xs">Total (inc. GST)</span>
          <span className="font-bold text-blue-700 text-lg">
            {formatCurrency(s.total)}
          </span>
        </div>
      </div>
    </div>
  );
}
