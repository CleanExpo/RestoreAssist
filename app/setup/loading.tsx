export default function Loading() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-brand-cloud">
      {/* Brand rail skeleton (desktop) */}
      <aside className="hidden w-90 shrink-0 flex-col justify-between bg-brand-navy px-9 py-10 lg:flex xl:w-100">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-white/10" />
            <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
          </div>
          <div className="mt-10 space-y-3">
            <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
            <div className="h-7 w-56 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
          </div>
          <div className="mt-9 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <div className="h-7 w-7 animate-pulse rounded-full bg-white/10" />
                <div className="h-3.5 w-36 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-1.5 w-full animate-pulse rounded-full bg-white/10" />
      </aside>

      {/* Content pane skeleton */}
      <div className="flex h-dvh min-w-0 flex-1 flex-col bg-white">
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
            <div className="h-6 w-24 animate-pulse rounded-full bg-brand-navy/10" />
            <div className="mt-4 h-8 w-64 animate-pulse rounded bg-brand-navy/10" />
            <div className="mt-3 h-4 w-80 animate-pulse rounded bg-brand-navy/5" />
            <div className="mt-8 h-72 w-full animate-pulse rounded-2xl border border-brand-navy/10 bg-white" />
            <p className="sr-only" role="status">
              Loading your setup…
            </p>
          </div>
        </main>
        <footer className="border-t border-brand-navy/10 bg-white">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
            <div className="h-12 w-24 animate-pulse rounded-xl bg-brand-navy/10" />
            <div className="h-12 w-28 animate-pulse rounded-xl bg-brand-navy/10" />
          </div>
        </footer>
      </div>
    </div>
  );
}
