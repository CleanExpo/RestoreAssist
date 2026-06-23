"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function CreditExhaustModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("credit-exhausted", handler);
    return () => window.removeEventListener("credit-exhausted", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <h2 className="text-xl font-semibold">You&apos;re out of credits</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your monthly credits are used up. Upgrade your plan for higher monthly credits, or buy a one-time top-up.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/billing/upgrade?reason=credits"
            className="flex-1 rounded bg-brand-navy px-4 py-3 text-center text-white min-h-[44px]"
          >
            Upgrade plan
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
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
