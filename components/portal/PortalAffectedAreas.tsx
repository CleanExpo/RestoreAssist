import type { PortalAffectedAreaItem } from "@/lib/portal/portal-affected-areas";

/**
 * Client-safe list of rooms already on the job.
 *
 * Empty input renders nothing. A blank label still occupies a row — omitting
 * it would hide an AffectedArea the database has (RA-7573 Critic/Scout bar).
 */
export function PortalAffectedAreas({
  areas,
}: {
  areas: readonly PortalAffectedAreaItem[];
}) {
  if (areas.length === 0) return null;

  return (
    <div
      data-testid="portal-affected-areas"
      className="bg-white rounded-xl border border-slate-200 p-4"
    >
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
            data-testid="portal-affected-area"
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
