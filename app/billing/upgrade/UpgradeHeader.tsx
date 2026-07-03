type Reason = "trial-expired" | "credits" | "feature" | "voluntary" | null;

export default function UpgradeHeader({ reason, feature }: { reason: Reason; feature?: string }) {
  if (reason === "trial-expired") {
    return (
      <header className="mb-8 rounded border border-amber-300 bg-amber-50 p-6">
        <h1 className="text-2xl font-semibold">Your trial has ended</h1>
        <p className="mt-2 text-muted-foreground">
          Pick a plan below to keep working on your inspections and reports.
        </p>
      </header>
    );
  }
  if (reason === "credits") {
    return (
      <header className="mb-8 rounded border border-blue-300 bg-blue-50 p-6">
        <h1 className="text-2xl font-semibold">You&apos;re out of credits</h1>
        <p className="mt-2 text-muted-foreground">
          Upgrade to a paid plan for monthly credits, or buy a one-time top-up.
        </p>
      </header>
    );
  }
  if (reason === "feature") {
    return (
      <header className="mb-8 rounded border border-purple-300 bg-purple-50 p-6">
        <h1 className="text-2xl font-semibold">Unlock {feature ?? "this feature"}</h1>
        <p className="mt-2 text-muted-foreground">
          Subscribe to unlock this feature.
        </p>
      </header>
    );
  }
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold">Choose a plan</h1>
      <p className="mt-2 text-muted-foreground">All plans include the IICRC-compliant report generator.</p>
    </header>
  );
}
