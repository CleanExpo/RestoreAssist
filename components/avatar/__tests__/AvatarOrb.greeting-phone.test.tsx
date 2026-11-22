// @vitest-environment jsdom
/**
 * RA-8532 — at 390px the Margot greeting card opened by itself and sat over the
 * home hero's "See how it works" link. The card was only held back for a
 * coarse pointer, so a phone-width window with a mouse (the Playwright walk
 * that found it) still got it. These cases run the real media-query string the
 * component asks for against a stand-in screen, so they do not depend on which
 * query the component chose.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AvatarOrb } from "../AvatarOrb";

vi.mock("next/image", () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...rest} />
  ),
}));

const GREETING = "Hello from Margot";

/** Evaluates a comma-separated media query list for one simulated screen. */
function stubScreen(width: number, coarse: boolean) {
  const matchesOne = (part: string): boolean => {
    const q = part.trim();
    if (q === "(pointer: coarse)") return coarse;
    if (q === "(pointer: fine)") return !coarse;
    const max = /^\(max-width:\s*(\d+)px\)$/.exec(q);
    if (max) return width <= Number(max[1]);
    const min = /^\(min-width:\s*(\d+)px\)$/.exec(q);
    if (min) return width >= Number(min[1]);
    throw new Error(`stubScreen does not understand "${q}"`);
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.split(",").some(matchesOne),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/** Past the 600ms entrance and 800ms delay, before the 6s auto-hide. */
function advanceToGreeting() {
  act(() => {
    vi.advanceTimersByTime(700);
  });
  act(() => {
    vi.advanceTimersByTime(1_000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RA-8532 Margot greeting card at phone width", () => {
  it("does not open by itself in a 390px window with a mouse", () => {
    stubScreen(390, false);
    render(<AvatarOrb greetingText={GREETING} />);
    advanceToGreeting();
    expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
  });

  it("does not open by itself on a touch phone", () => {
    stubScreen(390, true);
    render(<AvatarOrb greetingText={GREETING} />);
    advanceToGreeting();
    expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
  });

  it("still opens by itself on a 1440px desktop", () => {
    stubScreen(1440, false);
    render(<AvatarOrb greetingText={GREETING} />);
    advanceToGreeting();
    expect(screen.getByText(GREETING)).toBeInTheDocument();
  });

  it("still opens by itself at 640px, the sm breakpoint", () => {
    stubScreen(640, false);
    render(<AvatarOrb greetingText={GREETING} />);
    advanceToGreeting();
    expect(screen.getByText(GREETING)).toBeInTheDocument();
  });
});
