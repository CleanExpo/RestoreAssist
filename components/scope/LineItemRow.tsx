"use client";

interface LineItemRowProps {
  line: any;
  onChange: (patch: any) => void;
  onRemove: () => void;
}

export default function LineItemRow({ line, onChange, onRemove }: LineItemRowProps) {
  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="font-semibold text-gray-900">
            {line.code} — {line.desc}
          </div>
          {line.clause && (
            <div className="text-xs text-gray-600 mt-1">📋 {line.clause}</div>
          )}
        </div>
        <button
          className="text-red-600 hover:text-red-800 font-medium text-sm transition-colors"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <label className="text-sm">
          <span className="block text-gray-700 font-medium mb-1">Qty</span>
          <input
            type="number"
            min="0"
            step="0.1"
            className="border border-gray-300 rounded px-2 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={line.qty || 1}
            onChange={(e) => onChange({ qty: Number(e.target.value) })}
          />
        </label>

        <label className="text-sm">
          <span className="block text-gray-700 font-medium mb-1">Days</span>
          <input
            type="number"
            min="0"
            step="0.5"
            className="border border-gray-300 rounded px-2 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={line.days || 1}
            onChange={(e) => onChange({ days: Number(e.target.value) })}
          />
        </label>

        <label className="text-sm">
          <span className="block text-gray-700 font-medium mb-1">Unit</span>
          <input
            type="text"
            className="border border-gray-300 rounded px-2 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={line.unit || "EA"}
            onChange={(e) => onChange({ unit: e.target.value })}
          />
        </label>

        <label className="text-sm col-span-2 md:col-span-3">
          <span className="block text-gray-700 font-medium mb-1">Notes</span>
          <input
            type="text"
            className="border border-gray-300 rounded px-2 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional notes or variations"
            value={line.notes || ""}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </label>
      </div>

      {/* Show labour/equipment/materials counts if present */}
      <div className="mt-3 flex gap-4 text-xs text-gray-600">
        {line.labour && line.labour.length > 0 && (
          <div>
            👷 {line.labour.length} labour role{line.labour.length > 1 ? 's' : ''}
          </div>
        )}
        {line.equipment && line.equipment.length > 0 && (
          <div>
            🔧 {line.equipment.length} equipment item{line.equipment.length > 1 ? 's' : ''}
          </div>
        )}
        {line.materials && line.materials.length > 0 && (
          <div>
            📦 {line.materials.length} material{line.materials.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
