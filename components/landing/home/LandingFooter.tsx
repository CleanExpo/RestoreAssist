import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";

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
    <footer className="border-t border-slate-800/50 bg-slate-950/80">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="object-contain"
              />
              <span className="text-sm font-semibold text-white">
                {BRAND.name}
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              {BRAND.shortDescription}
            </p>
            <p className="mt-3 text-xs text-slate-500">{BRAND.slogan}</p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-slate-400 transition-colors hover:text-cyan-300"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-slate-800/50 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.company.legal}
            {BRAND.company.abn ? ` · ABN ${BRAND.company.abn}` : ""}
          </p>
          <p>
            <a
              href={`mailto:${BRAND.company.supportEmail}`}
              className="hover:text-cyan-300 transition-colors"
            >
              {BRAND.company.supportEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
