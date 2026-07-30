"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { CTA_PRIMARY, CTA_SECONDARY, FONT_DISPLAY, CONTAINER } from "./motion";
import { LANDING_HOMES } from "./landingConcepts";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
] as const;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2";

export function LandingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [homesOpen, setHomesOpen] = useState(false);
  const homesRef = useRef<HTMLDivElement>(null);

  const activeHome =
    LANDING_HOMES.find((c) => c.href === pathname) ?? LANDING_HOMES[0];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setHomesOpen(false);
  }, []);

  useEffect(() => {
    if (!open && !homesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHomesOpen(false);
        if (open) close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, homesOpen, close]);

  useEffect(() => {
    if (!homesOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (
        homesRef.current &&
        !homesRef.current.contains(e.target as Node)
      ) {
        setHomesOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [homesOpen]);

  useEffect(() => {
    setHomesOpen(false);
  }, [pathname]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-[#0B1F3A] focus:shadow-lg"
      >
        Skip to main content
      </a>
      <header
        className={[
          "fixed top-0 z-100 w-full border-b transition-[background-color,border-color,box-shadow] duration-300 ease-out",
          scrolled
            ? "border-slate-200/90 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-md"
            : "border-transparent bg-[#F3F5F7]/80 backdrop-blur-sm",
        ].join(" ")}
      >
        <div
          className={`${CONTAINER} flex h-[4.25rem] items-center justify-between`}
        >
          <Link
            href="/"
            className={`flex items-center gap-2.5 rounded-lg ${FOCUS}`}
          >
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              priority
              className="object-contain"
            />
            <span
              className={`${FONT_DISPLAY} text-[15px] font-bold tracking-tight text-[#0B1F3A] transition-colors hover:text-[#16345A]`}
            >
              {BRAND.name}
            </span>
          </Link>

          <nav
            className="hidden items-center gap-0.5 lg:flex"
            aria-label="Primary"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`group relative rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-slate-600 transition-colors duration-200 hover:text-[#0B1F3A] ${FOCUS}`}
              >
                {link.label}
                <span
                  className="pointer-events-none absolute inset-x-3.5 -bottom-0.5 h-px origin-left scale-x-0 bg-[#3B6D8C]/70 transition-transform duration-300 ease-out group-hover:scale-x-100"
                  aria-hidden
                />
              </Link>
            ))}

            <div ref={homesRef} className="relative ml-1">
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded-lg px-3.5 py-2 text-[13.5px] font-medium transition-colors duration-200 ${FOCUS} ${
                  homesOpen ||
                  LANDING_HOMES.some((c) => c.href === pathname)
                    ? "text-[#0B1F3A]"
                    : "text-slate-600 hover:text-[#0B1F3A]"
                }`}
                aria-expanded={homesOpen}
                aria-haspopup="menu"
                aria-controls="homes-menu"
                onClick={() => setHomesOpen((v) => !v)}
              >
                Home
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${homesOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <div
                id="homes-menu"
                role="menu"
                aria-label="Home page versions"
                className={`absolute top-full left-0 z-50 mt-2 w-[22rem] origin-top-left rounded-xl border border-slate-200/90 bg-white p-2 shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-[opacity,transform] duration-200 ${
                  homesOpen
                    ? "pointer-events-auto scale-100 opacity-100"
                    : "pointer-events-none scale-[0.98] opacity-0"
                }`}
              >
                {LANDING_HOMES.map((home) => {
                  const active = pathname === home.href;
                  return (
                    <Link
                      key={home.href}
                      href={home.href}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setHomesOpen(false)}
                      className={`block rounded-lg px-3.5 py-3 transition-colors ${FOCUS} ${
                        active
                          ? "bg-[#F3F5F7] text-[#0B1F3A]"
                          : "text-slate-700 hover:bg-slate-50 hover:text-[#0B1F3A]"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span
                          className={`${FONT_DISPLAY} text-[13.5px] font-semibold tracking-tight`}
                        >
                          {home.label}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
                          {home.pattern}
                        </span>
                      </span>
                      <span className="mt-1 block text-[12.5px] leading-snug text-slate-500">
                        {home.description}
                      </span>
                    </Link>
                  );
                })}
                <p className="px-3.5 pt-1.5 pb-1 text-[11px] leading-snug text-slate-400">
                  Viewing: {activeHome.label} · {activeHome.pattern}
                </p>
              </div>
            </div>
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/login"
              className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-slate-600 transition-colors hover:text-[#0B1F3A] ${FOCUS}`}
            >
              Log in
            </Link>
            <Link
              href={BRAND.cta.primary.href}
              className={`inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-[#16345A] active:scale-[0.985] ${FOCUS}`}
            >
              Start free
            </Link>
          </div>

          <button
            type="button"
            className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#0B1F3A] transition-colors hover:bg-slate-100 lg:hidden ${FOCUS}`}
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            <Menu size={22} aria-hidden />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-150 bg-[#0B1F3A]/20 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden={!open}
      />
      <div
        id="mobile-nav"
        className={`fixed top-0 right-0 z-160 flex h-dvh w-80 max-w-[85vw] flex-col border-l border-slate-200 bg-white shadow-[-8px_0_30px_rgba(15,23,42,0.06)] lg:hidden ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
        style={{ transition: "transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <span className={`${FONT_DISPLAY} text-sm font-bold text-[#0B1F3A]`}>
            {BRAND.name}
          </span>
          <button
            type="button"
            onClick={close}
            className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 ${FOCUS}`}
            aria-label="Close menu"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              className="block rounded-xl px-4 py-3.5 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#0B1F3A]"
            >
              {link.label}
            </Link>
          ))}

          <div className="mt-4 border-t border-slate-200 pt-4">
            <p
              className={`${FONT_DISPLAY} px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3B6D8C]`}
            >
              Home
            </p>
            <ul className="mt-2 space-y-1">
              {LANDING_HOMES.map((home) => {
                const active = pathname === home.href;
                return (
                  <li key={home.href}>
                    <Link
                      href={home.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-xl px-4 py-3 transition-colors ${
                        active
                          ? "bg-[#F3F5F7] text-[#0B1F3A]"
                          : "text-slate-700 hover:bg-slate-50 hover:text-[#0B1F3A]"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[15px] font-medium">
                          {home.label}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#3B6D8C]">
                          {home.pattern}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
                        {home.description}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
        <div className="space-y-2.5 border-t border-slate-200 p-4">
          <Link
            href={BRAND.cta.primary.href}
            onClick={close}
            className={`${CTA_PRIMARY} w-full`}
          >
            Start free
          </Link>
          <Link
            href="/login"
            onClick={close}
            className={`${CTA_SECONDARY} w-full`}
          >
            Log in
          </Link>
        </div>
      </div>
    </>
  );
}
