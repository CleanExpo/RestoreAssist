import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";

const DISPLAY = "font-[family-name:var(--font-landing-display)]";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Start free" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/resources", label: "Resources" },
      { href: "/login", label: "Log in" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200/90 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr] md:gap-12">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2"
            >
              <Image
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="object-contain"
              />
              <span
                className={`${DISPLAY} text-[15px] font-bold tracking-tight text-[#0B1F3A]`}
              >
                {BRAND.name}
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-[15px] leading-[1.72] text-slate-600">
              {BRAND.shortDescription}
            </p>
            <p
              className={`${DISPLAY} mt-5 text-sm font-semibold tracking-tight text-[#0B1F3A]`}
            >
              {BRAND.slogan}
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
              {BRAND.tagline} Designed for restoration companies across
              Australia and New Zealand.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {col.title}
              </p>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="rounded-sm text-[15px] text-slate-600 transition-colors hover:text-[#0B1F3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-slate-200 pt-8 text-xs leading-relaxed text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.company.legal}
            {BRAND.company.abn ? ` · ABN ${BRAND.company.abn}` : ""}
          </p>
          <p>
            <a
              href={`mailto:${BRAND.company.supportEmail}`}
              className="rounded-sm transition-colors hover:text-[#0B1F3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50"
            >
              {BRAND.company.supportEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
