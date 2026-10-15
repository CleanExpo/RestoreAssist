import Link from "next/link";

const TRUST = [
  { label: "Secured checkout", detail: "Stripe" },
  { label: "Cancel anytime", detail: "Self-serve portal" },
  { label: "GST inclusive", detail: "AUD pricing" },
] as const;

export default function UpgradeTrustStrip({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {TRUST.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border/80 bg-card/80 px-3 py-2 backdrop-blur-sm"
          >
            <p className="text-xs font-semibold text-foreground">{item.label}</p>
            <p className="text-[10px] text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>
      <Link
        href={backHref}
        className="text-sm font-medium text-cyan-600 hover:text-cyan-500 dark:text-cyan-400"
      >
        {backLabel} →
      </Link>
    </div>
  );
}
