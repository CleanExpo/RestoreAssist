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
  };
});

// next/image → plain <img> (jsdom has no Next image loader).
vi.mock("next/image", () => {
  const React = require("react");
  return {
    default: ({ src, alt, ...rest }: Record<string, unknown>) =>
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
  // AvatarOrb takes a greetingVideoUrl prop that the PR intentionally omitted.
  // Render the prop into the DOM so that IF a regression ever re-adds the
  // phill-greeting.mp4 src, the video-404 guard below would catch it.
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

    it("AvatarOrb on the home page renders with NO greeting video url", () => {
      const { getByTestId, unmount } = render(<Home />);
      const orb = getByTestId("avatar-orb-stub");
      expect(orb.getAttribute("data-greeting-video-url")).toBe("");
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

  describe("finalized hero copy / CTA from the PR is present", () => {
    it("home page renders the finalized primary CTA label", () => {
      const { container, unmount } = render(<Home />);
      expect(container.textContent).toContain(
        "Start with your ABN — under 90 seconds",
      );
      unmount();
    });

    it.each([
      "One field in. Eleven fields out.",
      "Every wired capability is checked before Activate.",
      "IICRC S500:2021 §7.1 cited correctly in every report footer.",
    ])("home page renders proof bullet: %s", (bullet) => {
      const { container, unmount } = render(<Home />);
      expect(container.textContent).toContain(bullet);
      unmount();
    });
  });
});
