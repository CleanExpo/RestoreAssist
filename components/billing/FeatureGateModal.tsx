"use client";

import Link from "next/link";

export default function FeatureGateModal({
  feature,
  onClose,
}: {
  feature: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <h2 className="text-xl font-semibold">Unlock {feature}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Subscribe to unlock {feature}.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href={`/billing/upgrade?reason=feature&feature=${encodeURIComponent(feature)}`}
            className="flex-1 rounded bg-brand-navy px-4 py-3 text-center text-white min-h-[44px]"
          >
            See plans
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-3 min-h-[44px] min-w-[44px]"
            aria-label="Close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
