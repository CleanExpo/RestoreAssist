"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { CTA_PRIMARY, CTA_SECONDARY, FONT_DISPLAY } from "./motion";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
] as const;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2";

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

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
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
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
