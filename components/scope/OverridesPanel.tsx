"use client";

interface OverridesPanelProps {
  overrides: any;
  onChange: (overrides: any) => void;
}

export default function OverridesPanel({ overrides, onChange }: OverridesPanelProps) {
  const o = overrides || {};

  const field = (key: string, label: string, defaultValue: number) => (
    <label className="text-sm">
      <span className="block text-gray-700 font-medium mb-1">{label}</span>
      <div className="relative">
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          className="border border-gray-300 rounded px-2 py-1.5 w-full text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={o[key] ?? defaultValue}
          onChange={(e) => onChange({ ...o, [key]: Number(e.target.value) })}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
          %
        </span>
      </div>
    </label>
  );

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        OH&P & Tax Overrides
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {field("overhead_pct", "Overhead", 15)}
        {field("profit_pct", "Profit", 20)}
        {field("contingency_pct", "Contingency", 10)}
        {field("gst_pct", "GST/Tax", 10)}
      </div>
      <p className="text-xs text-gray-600 mt-3">
        💡 Adjust these percentages to customize the final estimate calculation.
        Defaults: Overhead 15%, Profit 20%, Contingency 10%, GST 10%.
      </p>
    </div>
  );
}
