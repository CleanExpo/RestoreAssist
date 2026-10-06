import Link from "next/link";

/**
 * Shown to staff who reach the upgrade page. Billing belongs to the business
 * owner (WP-06): a technician or manager has no plan of their own to buy, and
 * the checkout and portal routes refuse them, so no payment control is offered.
 */
export default function OwnerOnlyBillingNotice() {
  return (
    <main className="relative mx-auto w-full max-w-xl px-5 py-12 sm:px-8">
      <div
        role="status"
        className="rounded-xl border border-border bg-card p-6 text-card-foreground"
      >
        <h1 className="text-xl font-semibold">Billing is managed by your business owner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account uses your business&apos;s plan. Ask your business owner to
          subscribe or make changes to billing.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
