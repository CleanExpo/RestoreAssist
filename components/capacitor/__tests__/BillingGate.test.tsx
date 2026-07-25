// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hideBillingUI = vi.fn(() => false);
vi.mock("@/lib/capacitor", () => ({
  shouldHideBillingUI: () => hideBillingUI(),
}));

import BillingGate from "../BillingGate";

beforeEach(() => {
  hideBillingUI.mockReturnValue(false);
});

/**
 * The defect this guards (found by frozen-head review of PR #1989):
 * visibility was gated on a useState flag set inside useEffect, so on iOS the
 * REAL billing UI was painted for one committed render before being hidden —
 * App Review 3.1.1 exposure across all 18 call sites, not just one.
 *
 * The fix reads the platform synchronously during render via
 * useSyncExternalStore, so there is no window in which children are committed
 * on iOS. Note honestly: Testing Library flushes effects, so it CANNOT observe
 * a pre-effect committed render — which is exactly why the fix removes the
 * effect from the visibility path rather than trying to time it. The invariant
 * is structural, and the SSR test below is what discriminates this fix from a
 * naive fail-closed inversion.
 */
describe("BillingGate", () => {
  it("server-renders children so crawlers and web users still get pricing HTML", () => {
    // A naive "fail closed until hydrated" inversion breaks this: it would
    // emit the placeholder to every crawler on the public /pricing page.
    // A server request is never an iOS Capacitor shell, so the server
    // snapshot must be "do not hide".
    hideBillingUI.mockReturnValue(true);

    const html = renderToString(
      <BillingGate>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(html).toContain("View plans");
    expect(html).not.toContain("Managed by your workspace");
  });

  it("hides billing UI on the client in the iOS shell", () => {
    hideBillingUI.mockReturnValue(true);

    render(
      <BillingGate>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(
      screen.queryByRole("button", { name: "View plans" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /managed by your workspace/iu }),
    ).toBeInTheDocument();
  });

  it("renders children on the client when not in the iOS shell", () => {
    hideBillingUI.mockReturnValue(false);

    render(
      <BillingGate>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(
      screen.getByRole("button", { name: "View plans" }),
    ).toBeInTheDocument();
  });

  it("honours a custom fallback", () => {
    hideBillingUI.mockReturnValue(true);

    render(
      <BillingGate fallback={<p>Ask your administrator</p>}>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(screen.getByText("Ask your administrator")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View plans" }),
    ).not.toBeInTheDocument();
  });

  // Second defect found while writing these tests: `fallback ?? <default>`
  // treats an explicitly-passed `null` as "not provided", so every call site
  // using fallback={null} — 11 of 18 — rendered the default placeholder
  // heading on iOS where the author intended nothing at all.
  it("renders nothing when a null fallback is passed (11 of 18 call sites)", () => {
    hideBillingUI.mockReturnValue(true);

    const { container } = render(
      <BillingGate fallback={null}>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("gates visibility without an effect — no useEffect in the visibility path", async () => {
    // Structural guard for the defect class. RTL cannot observe the pre-effect
    // commit, so this asserts the implementation shape that made it possible.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "components/capacitor/BillingGate.tsx"),
      "utf8",
    );

    expect(src).toContain("useSyncExternalStore(");
    // No effect CALL (prose mentioning the old approach in comments is fine).
    expect(src).not.toMatch(/useEffect\s*\(/u);
    // And no deferred visibility flag of the shape that caused the defect.
    expect(src).not.toMatch(/setHydrated|hydrated/u);
  });
});
