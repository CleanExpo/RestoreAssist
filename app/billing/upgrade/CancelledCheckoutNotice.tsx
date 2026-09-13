/**
 * Subdued acknowledgement when Stripe checkout is cancelled.
 * Copy is pinned by e2e/billing/cancel-flow.spec.ts (`/no problem/i`).
 */
export default function CancelledCheckoutNotice() {
  return (
    <p
      role="status"
      className="mb-6 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground"
    >
      No problem — continue when you&apos;re ready.
    </p>
  );
}
