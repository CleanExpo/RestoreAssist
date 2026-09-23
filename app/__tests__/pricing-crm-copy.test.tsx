// @vitest-environment jsdom
/**
 * RA-7714 — the public /pricing page sells the CRM, not "report software",
 * and never names a competitor as an ongoing connection or mentions NRPG.
 *
 * Renders the real page (and reads the real layout metadata). Only the
 * landing chrome and framer-motion are stubbed: the hero stub renders its
 * `title` into an <h1> exactly as components/landing/home/MarketingPageHero
 * does (motion.h1 {title}).
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(
      (
        {
          children,
          initial: _initial,
          animate: _animate,
          whileInView: _whileInView,
          whileHover: _whileHover,
          whileTap: _whileTap,
          viewport: _viewport,
          transition: _transition,
          variants: _variants,
          exit: _exit,
          style: _style,
          ...rest
        }: Record<string, unknown>,
        ref: unknown,
      ) => React.createElement(tag, { ref, ...rest }, children as React.ReactNode),
    );
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
  };
});

vi.mock("@/components/landing/home", () => {
  const React = require("react");
  return {
    MarketingShell: ({ children }: { children: React.ReactNode }) =>
      React.createElement("main", null, children),
    MarketingPageHero: ({
      title,
      description,
    }: {
      title: string;
      description?: string;
    }) =>
      React.createElement(
        "section",
        null,
        React.createElement("h1", null, title),
        React.createElement("p", null, description),
      ),
  };
});

vi.mock("next/link", () => {
  const React = require("react");
  return {
    default: ({ href, children, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children as React.ReactNode),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import PricingPage from "../pricing/page";
import { metadata } from "../pricing/layout";

const FORBIDDEN = /Service CRM Connection|sync jobs|connect ascora|NRPG/i;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/pricing sells the CRM", () => {
  it("the H1 names the CRM", () => {
    render(<PricingPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/CRM/);
    expect(h1.textContent).not.toMatch(/Report Software/i);
  });

  it("the page title and Open Graph title name the CRM", () => {
    expect(String(metadata.title)).toMatch(/CRM/);
    expect(String(metadata.title)).not.toMatch(/Report Software/i);
    const og = metadata.openGraph as { title?: string };
    expect(String(og.title)).toMatch(/CRM/);
    expect(String(og.title)).not.toMatch(/Report Software/i);
  });

  it("names no competitor as a connection and never mentions NRPG", () => {
    vi.stubEnv("NEXT_PUBLIC_NRPG_ENABLED", "");
    render(<PricingPage />);
    const text = document.body.textContent ?? "";
    // Positive control: the add-on table rendered at all.
    expect(text).toMatch(/Technician/i);
    expect(text).not.toMatch(FORBIDDEN);
    // RA-7714 round 2: only the Ascora import can be started, so the add-on
    // is sold for Ascora alone.
    expect(text).toContain("Migrate from Ascora");
    expect(text).not.toMatch(/ServiceM8/i);
  });
});
