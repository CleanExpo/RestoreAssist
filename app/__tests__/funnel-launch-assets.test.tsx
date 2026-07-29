// @vitest-environment jsdom
//
// Funnel launch-assets render smoke test (PR #1303 — ra-funnel-launch-assets).
//
// This is the automated stand-in for the manual "open the page and eyeball it"
// check that PR #1303 never got (the worktree had no node_modules, so no build
// or preview was run). It guards the three things that PR fixed against
// regression:
//
//   1. DEAD-LINK GUARD — no anchor renders with href="#". The PR replaced two
//      dead "Coming Soon" href="#" links (app/blog, app/compliance-library)
//      with non-interactive aria-disabled <span> badges. A future edit that
//      re-introduces an href="#" anchor must fail this test.
//
//   2. VIDEO 404 GUARD — the removed HeyGen greeting asset
//      "/videos/heygen/phill-greeting.mp4" must appear NOWHERE in the rendered
//      DOM of app/page.tsx. NOTE: the path still appears in app/page.tsx as a
//      *source comment* documenting the restore path, which is exactly why this
//      is a RENDER test, not a static grep — comments are stripped from the DOM,
//      so a grep would false-positive but the render correctly passes.
//
//   3. FINALIZED COPY GUARD — the finalized (DRAFT) hero proof bullets + primary
//      CTA from the PR are present in the rendered home page.
//
// Approach: React Testing Library + jsdom (the repo's existing component-test
// convention — see components/**/__tests__/*.test.tsx and
// app/capture/[token]/__tests__/page.test.tsx). Heavy / non-deterministic child
// components and Next.js primitives are stubbed so the assertions target the
// hero/funnel markup the PR actually changed, not their internals.

import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ── Stubs ──────────────────────────────────────────────────────────────────
// framer-motion: render motion.* as plain DOM elements (no animation timers,
// no IntersectionObserver dependency for whileInView).
vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(
      (
        {
          children,
          // strip motion-only props so React doesn't warn on unknown DOM attrs
          initial: _initial,
          animate: _animate,
          whileInView: _whileInView,
          whileHover: _whileHover,
          whileTap: _whileTap,
          viewport: _viewport,
          transition: _transition,
          ...rest
        }: Record<string, unknown>,
        ref: unknown,
      ) => React.createElement(tag, { ref, ...rest }, children as React.ReactNode),
    );
  return {
    motion: new Proxy(
      {},
      { get: (_t, tag: string) => passthrough(tag) },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
  };
});

// next/image → plain <img> (jsdom has no Next image loader).
vi.mock("next/image", () => {
  const React = require("react");
  return {
    default: ({ src, alt, fill: _fill, priority: _priority, sizes: _sizes, ...rest }: Record<string, unknown>) =>
      React.createElement("img", { src, alt, ...rest }),
  };
});

// next/link → plain <a> so anchor-href assertions see real hrefs.
vi.mock("next/link", () => {
  const React = require("react");
  return {
    default: ({ href, children, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children as React.ReactNode),
  };
});

vi.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({
    className: "font-landing",
    variable: "--font-landing",
  }),
  Outfit: () => ({
    className: "font-landing-display",
    variable: "--font-landing-display",
  }),
}));

// Landing chrome / heavy widgets — render as inert markers. These are NOT the
// subject under test; stubbing them keeps the render deterministic.
vi.mock("@/components/landing/Header", () => ({
  default: () => {
    const React = require("react");
    return React.createElement("header", { "data-testid": "header-stub" });
  },
}));
vi.mock("@/components/landing/Footer", () => ({
  default: () => {
    const React = require("react");
    return React.createElement("footer", { "data-testid": "footer-stub" });
  },
}));
vi.mock("@/components/landing/MobileWorkflowCarousel", () => ({
  default: () => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "carousel-stub" });
  },
}));
vi.mock("@/components/avatar", () => ({
  // Landing V1 (daylight workshop) no longer mounts AvatarOrb on home.
  // Keep a stub so accidental re-imports don't pull HeyGen video paths.
  AvatarOrb: (props: Record<string, unknown>) => {
    const React = require("react");
    return React.createElement("div", {
      "data-testid": "avatar-orb-stub",
      "data-greeting-video-url": (props.greetingVideoUrl as string) ?? "",
    });
  },
}));

import Home from "../page";
import BlogPage from "../blog/page";
import ComplianceLibraryPage from "../compliance-library/page";

const DEAD_VIDEO_SRC = "/videos/heygen/phill-greeting.mp4";

describe("funnel launch assets — render smoke (PR #1303)", () => {
  describe("dead-link guard: no rendered anchor uses href=\"#\"", () => {
    it.each([
      ["app/page.tsx (home)", Home],
      ["app/blog/page.tsx", BlogPage],
      ["app/compliance-library/page.tsx", ComplianceLibraryPage],
    ])("%s has zero href=\"#\" anchors", (_name, Component) => {
      const { container, unmount } = render(<Component />);
      const anchors = Array.from(container.querySelectorAll("a"));
      const deadLinks = anchors.filter(
        (a) => a.getAttribute("href") === "#",
      );
      expect(deadLinks).toHaveLength(0);
      unmount();
    });
  });

  describe("video-404 guard: phill-greeting.mp4 is absent from rendered DOM", () => {
    it.each([
      ["app/page.tsx (home)", Home],
      ["app/blog/page.tsx", BlogPage],
      ["app/compliance-library/page.tsx", ComplianceLibraryPage],
    ])("%s does not reference the removed greeting video", (_name, Component) => {
      const { container, unmount } = render(<Component />);
      expect(container.innerHTML).not.toContain(DEAD_VIDEO_SRC);
      unmount();
    });

    it("home page does not mount the AvatarOrb assistant", () => {
      const { queryByTestId, unmount } = render(<Home />);
      expect(queryByTestId("avatar-orb-stub")).toBeNull();
      unmount();
    });

    it("home page uses the daylight workshop hero photo, not HeyGen video", () => {
      const { container, unmount } = render(<Home />);
      expect(container.innerHTML).toContain("/landing/hero-workshop.jpg");
      expect(container.innerHTML).not.toContain(DEAD_VIDEO_SRC);
      unmount();
    });
  });

  // NOTE: app/blog/page.tsx no longer renders Coming Soon badges — its
  // articles now ship as real /blog/[slug] routes (see
  // app/__tests__/blog-route-integrity.test.tsx). compliance-library still
  // uses Coming Soon badges, so it remains guarded here.
  describe("Coming Soon badges are non-interactive (not links)", () => {
    it.each([
      ["app/compliance-library/page.tsx", ComplianceLibraryPage],
    ])("%s renders aria-disabled Coming Soon badges, never anchors", (_name, Component) => {
      const { container, unmount } = render(<Component />);
      const badges = Array.from(
        container.querySelectorAll('[aria-disabled="true"]'),
      ).filter((el) => /coming soon/i.test(el.textContent ?? ""));
      expect(badges.length).toBeGreaterThan(0);
      // Every Coming Soon badge must be a non-anchor element (the PR fix).
      for (const badge of badges) {
        expect(badge.tagName.toLowerCase()).not.toBe("a");
      }
      unmount();
    });
  });

  describe("premium hero copy / CTA is present", () => {
    it("home page renders the primary trial CTA", () => {
      const { container, unmount } = render(<Home />);
      expect(container.textContent).toContain("Start free — 3 trial reports");
      unmount();
    });

    it.each([
      "One System. Fewer Gaps. More Confidence.",
      "Office and Field. One System.",
      "From site to signed report.",
      "IICRC S500:2021",
      "What's included in the free trial?",
    ])("home page renders brand/trust signal: %s", (copy) => {
      const { container, unmount } = render(<Home />);
      expect(container.textContent).toContain(copy);
      unmount();
    });
  });

  describe("daylight / no-AI-feel guard", () => {
    it("home page does not surface AI product language", () => {
      const { container, unmount } = render(<Home />);
      const text = container.textContent ?? "";
      const forbidden = [
        /AI key/i,
        /Anthropic/i,
        /OpenAI/i,
        /chat widget/i,
        /AI-powered/i,
        /AI-driven/i,
        /assisted drafting/i,
        /AvatarOrb/i,
      ];
      for (const pattern of forbidden) {
        expect(text).not.toMatch(pattern);
      }
      unmount();
    });

    it("home page stays on the daylight canvas (no dark SaaS shell)", () => {
      const { container, unmount } = render(<Home />);
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.className ?? "").toContain("bg-[#F3F5F7]");
      expect(root?.className ?? "").not.toMatch(/bg-slate-900|bg-zinc-950|bg-black/);
      unmount();
    });
  });
});
