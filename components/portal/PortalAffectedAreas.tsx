import type { PortalAffectedAreaItem } from "@/lib/portal/portal-affected-areas";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

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
    <div data-testid="portal-affected-areas" className={clientPortalPanelPadding}>
      <h2 className="mb-3 text-sm font-semibold text-white/90">
        Affected Areas
        <span className="ml-2 text-xs font-normal text-slate-500">
          ({areas.length})
        </span>
      </h2>
      <ul className="space-y-2">
        {areas.map((area) => (
          <li
            key={area.id}
            data-testid="portal-affected-area"
            className="flex items-center justify-between border-b border-white/5 py-1.5 last:border-0"
          >
            <span className="text-sm text-slate-200">{area.label}</span>
            <span className="text-xs text-slate-500">
              Included in the restoration plan
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
