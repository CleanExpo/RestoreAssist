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
  /**
   * KNOWN OPEN DEFECT — do not "fix" this test to pass.
   *
   * capacitor.config.ts:22 points the iOS shell at https://restoreassist.app
   * (no output:"export"), so the shell loads SERVER-RENDERED HTML over HTTP.
   * React 19 also uses getServerSnapshot during hydration
   * (react-dom-client mountSyncExternalStore, `if (isHydrating)`), so on the
   * hydration path the billing UI is painted and stays visible for the whole
   * bundle-download-and-hydrate window.
   *
   * This cannot be closed inside this component: the server has no way to tell
   * an iOS shell request from a crawler request. It needs a server-visible
   * signal — capacitor.config.ts sets no appendUserAgent/overrideUserAgent —
   * which changes the native shell build and is therefore a founder/Board call.
   *
   * Left skipped, and asserting the CORRECT behaviour, so it turns green only
   * when the real fix lands. It must never be rewritten to assert the current
   * (defective) output.
   */
  it.skip("SSR must not emit billing UI when the request is an iOS shell", () => {
    hideBillingUI.mockReturnValue(true);

    const html = renderToString(
      <BillingGate>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(html).not.toContain("View plans");
  });

  it("server-renders children for ordinary web requests (crawlability)", () => {
    hideBillingUI.mockReturnValue(false);

    const html = renderToString(
      <BillingGate>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(html).toContain("View plans");
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

  /**
   * The hydration path is the one the iOS shell actually takes, and until now
   * nothing in this repo could fail on this defect class: every other test
   * uses RTL render() (createRoot), which is the fresh-mount path that was
   * never the problem.
   *
   * Skipped because it currently fails by design — see the SSR note above.
   * It asserts the CORRECT behaviour so it goes green when the shell-signal
   * fix lands.
   */
  it.skip("does not commit billing UI during hydration in the iOS shell", async () => {
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("react");

    hideBillingUI.mockReturnValue(false);
    const html = renderToString(
      <BillingGate>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // Now the client is the iOS shell.
    hideBillingUI.mockReturnValue(true);

    let domAtCommit = "";
    await act(async () => {
      hydrateRoot(
        container,
        <BillingGate>
          <button type="button">View plans</button>
        </BillingGate>,
      );
      // Captured after the hydration commit, before passive effects flush.
      domAtCommit = container.innerHTML;
    });

    expect(domAtCommit).not.toContain("View plans");
  });

  it("gates visibility synchronously during render, not in an effect", () => {
    // Fresh-mount path (client-side navigation) — this IS closed by the
    // useSyncExternalStore change and is what this assertion covers.
    hideBillingUI.mockReturnValue(true);

    const { container } = render(
      <BillingGate fallback={null}>
        <button type="button">View plans</button>
      </BillingGate>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
