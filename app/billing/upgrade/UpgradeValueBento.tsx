import { PRICING_CONFIG } from "@/lib/pricing";
import {
  upgradeBentoTile,
  upgradeBentoTileShine,
} from "@/lib/billing/upgrade-page-theme";
import { cn } from "@/lib/utils";

const PILLARS = [
  {
    title: "Field to invoice",
    body: "Inspections, moisture, photos, reports, and billing in one workspace.",
  },
  {
    title: "Standards-aware",
    body: "Report structure aligned to IICRC S500:2021 sections — built for restoration workflows.",
  },
  {
    title: "Team-ready",
    body: "Invite technicians and managers; permissions enforced on every route.",
  },
  {
    title: "Export & share",
    body: "PDF and Excel exports plus client-facing packs when you need them.",
  },
] as const;

export default function UpgradeValueBento({ className }: { className?: string }) {
  const plan = PRICING_CONFIG.pricing.monthly;

  return (
    <aside className={cn("space-y-5", className)}>
      <div className="grid grid-cols-2 gap-3">
        <div className={cn(upgradeBentoTile, "col-span-2 sm:col-span-1")}>
          <div aria-hidden className={upgradeBentoTileShine} />
          <p className="relative text-3xl font-semibold tabular-nums text-white">
            {plan.reportLimit}
          </p>
          <p className="relative mt-1 text-xs font-medium uppercase tracking-wide text-cyan-200/80">
            Reports / month
          </p>
        </div>
        <div className={cn(upgradeBentoTile, "col-span-2 sm:col-span-1")}>
          <div aria-hidden className={upgradeBentoTileShine} />
          <p className="relative text-3xl font-semibold tabular-nums text-white">
            +{plan.signupBonus}
          </p>
          <p className="relative mt-1 text-xs font-medium uppercase tracking-wide text-cyan-200/80">
            First month bonus
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">
          What stays on when you subscribe
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {PILLARS.map((item) => (
            <li key={item.title} className={cn(upgradeBentoTile, "p-4")}>
              <div aria-hidden className={upgradeBentoTileShine} />
              <p className="relative text-sm font-semibold text-white">
                {item.title}
              </p>
              <p className="relative mt-1 text-xs leading-relaxed text-white/60">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Integrations and add-on packs (bookkeeping, CRM, payments) are optional
        subscriptions on top of this base plan — priced separately in your
        dashboard.
      </p>
    </aside>
  );
}
