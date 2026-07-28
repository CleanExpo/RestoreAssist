"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { CTA_PRIMARY, CTA_SECONDARY } from "./motion";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
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

  return (
    <>
      <header
        className={[
          "fixed top-0 z-100 w-full border-b transition-all duration-300",
          scrolled
            ? "border-slate-800/50 bg-slate-950/90 backdrop-blur-md"
            : "border-transparent bg-slate-950/70 backdrop-blur-md",
        ].join(" ")}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              priority
              className="object-contain"
            />
            <span className="text-sm font-semibold tracking-tight text-slate-50 group-hover:text-white transition-colors">
              {BRAND.name}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2.5 lg:flex">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              Log in
            </Link>
            <Link
              href={BRAND.cta.primary.href}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.98]"
            >
              Start free
            </Link>
          </div>

          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800/60 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-150 bg-black/60 backdrop-blur-sm transition-opacity duration-250 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />
      <div
        className={`fixed top-0 right-0 z-160 flex h-dvh w-80 max-w-[85vw] flex-col border-l border-slate-800 bg-slate-950 lg:hidden ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
        style={{ transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <span className="text-sm font-semibold text-white">{BRAND.name}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-4 py-3 text-base font-medium text-slate-200 hover:bg-slate-800/60"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2.5 border-t border-slate-800 p-4">
          <Link
            href={BRAND.cta.primary.href}
            onClick={() => setOpen(false)}
            className={`${CTA_PRIMARY} w-full`}
          >
            Start free
          </Link>
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className={`${CTA_SECONDARY} w-full`}
          >
            Log in
          </Link>
        </div>
      </div>
    </>
  );
}
