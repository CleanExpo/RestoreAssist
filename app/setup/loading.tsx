export default function Loading() {
  return (
    <div className="fixed inset-0 z-40 flex w-full overflow-hidden bg-white">
      {/* Brand rail skeleton (desktop) */}
      <aside className="hidden h-full w-80 shrink-0 flex-col bg-brand-navy px-8 py-8 lg:flex lg:px-10 xl:w-96 xl:px-12 xl:py-10">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-white/10" />
              <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
            </div>
            <div className="mt-8 space-y-3">
              <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
              <div className="h-7 w-56 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
            </div>
          </div>
          <div className="mt-8 min-h-0 flex-1 space-y-2 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2">
                <div className="h-7 w-7 animate-pulse rounded-full bg-white/10" />
                <div className="h-3.5 w-36 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
          <div className="mt-6 shrink-0 border-t border-white/10 pt-5">
            <div className="h-1.5 w-full animate-pulse rounded-full bg-white/10" />
          </div>
        </div>
      </aside>

      {/* Content pane skeleton */}
      <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
            <div className="h-6 w-24 animate-pulse rounded-full bg-brand-navy/10" />
            <div className="mt-4 h-8 w-64 animate-pulse rounded bg-brand-navy/10" />
            <div className="mt-3 h-4 w-80 animate-pulse rounded bg-brand-navy/5" />
            <div className="mt-8 min-h-72 flex-1 w-full animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/5" />
            <p className="sr-only" role="status">
              Loading your setup…
            </p>
          </div>
        </main>
        <footer className="shrink-0 border-t border-brand-navy/10 bg-white">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5 lg:px-12">
            <div className="h-12 w-24 animate-pulse rounded-xl bg-brand-navy/10" />
            <div className="h-12 w-28 animate-pulse rounded-xl bg-brand-navy/10" />
          </div>
        </footer>
      </div>
    </div>
  );
}
