import type { PortalAffectedAreaItem } from "@/lib/portal/portal-affected-areas";

/**
 * Client-safe list of rooms already on the job. Empty input renders nothing —
 * the portal must not invent areas the database does not have (RA-7573).
 */
export function PortalAffectedAreas({
  areas,
}: {
  areas: readonly PortalAffectedAreaItem[];
}) {
  if (areas.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">
        Affected Areas
        <span className="ml-2 text-xs font-normal text-slate-400">
          ({areas.length})
        </span>
      </h2>
      <ul className="space-y-2">
        {areas.map((area) => (
          <li
            key={area.id}
            className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0"
          >
            <span className="text-sm text-slate-700">{area.label}</span>
            <span className="text-xs text-slate-500">
              Included in the restoration plan
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
