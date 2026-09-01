// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuotePage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/**
 * A critical advisory means the quote AS CONFIGURED prices Phase 1 air movers
 * over active mould -- what `reconcile-pricing-safety.ts` calls remediation
 * negligence (S520).
 *
 * Raised by CodeRabbit on this PR and verified: the advisory rendered, but
 * `handleSaveEstimate` checked only `if (!quoteResult) return`, so a technician
 * could save the estimate or raise the invoice straight past it. An advisory you
 * can click past is decoration, and the PR body claimed it meant "do not send".
 *
 * Sabotage: drop `hasCriticalSafetyConflict` from either `disabled` binding --
 * that button's assertion goes red.
 *
 * NOT covered: this is a CLIENT-side block. `/api/restoration-documents` does
 * not re-run the reconciliation, so a crafted request still saves. Closing that
 * means re-reconciling inside a shared endpoint used by other flows, which is
 * beyond this change.
 */
function quoteResponse(advisories: Array<{ severity: string; text: string }>) {
  return {
    quoteNumber: "QTE-TEST-1",
    quoteDate: new Date().toISOString(),
    jobType: "Water Damage Restoration",
    standardApplied: "",
    applicableStandards: [],
    safety: { mouldActive: advisories.length > 0, airMoverQty: 6, advisories },
    contractor: { businessName: "Test Co", abn: "", address: "", phone: "", email: "", logo: "" },
    client: { name: "", address: "", phone: "", email: "" },
    lineItems: [],
    subtotalExGST: 2750,
    gst: 275,
    totalIncGST: 3025,
    minimumApplied: false,
    minimumChargeAmount: 2750,
    pricingSource: "default_rates",
    pricingNote: "",
    jobDescription: "",
  };
}

const CRITICAL = [
  {
    severity: "critical",
    text: "6 air mover(s) are in the equipment selection on a job with active mould (IICRC S520).",
  },
];

function mockCalculate(advisories: Array<{ severity: string; text: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => quoteResponse(advisories),
    }),
  );
}

/** Pick a job type, then calculate — the page gates the form behind a job type. */
async function calculate() {
  fireEvent.click(screen.getAllByText(/Water Damage/i)[0]);
  await waitFor(() =>
    expect(screen.getByText(/Calculate/i)).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByText(/Calculate/i));
  await waitFor(() =>
    expect(screen.getByText(/Quote Generated/i)).toBeInTheDocument(),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("quote page — a critical safety conflict blocks the document", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables Save as Estimate and Create Invoice Draft", async () => {
    mockCalculate(CRITICAL);
    render(<QuotePage />);
    await calculate();

    expect(screen.getByText(/Do not send/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save as Estimate/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Create Invoice Draft/i }),
    ).toBeDisabled();
  });

  // Print is the operator reading their own screen, not creating a record.
  it("leaves Print alone", async () => {
    mockCalculate(CRITICAL);
    render(<QuotePage />);
    await calculate();

    expect(
      screen.getByRole("button", { name: /Print/i }),
    ).not.toBeDisabled();
  });

  it("leaves both save actions enabled when nothing is flagged", async () => {
    mockCalculate([]);
    render(<QuotePage />);
    await calculate();

    expect(screen.queryByText(/Do not send/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save as Estimate/i }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Create Invoice Draft/i }),
    ).not.toBeDisabled();
  });

  /**
   * WHY PRINT IS NOT BLOCKED, and why that is not a hole.
   *
   * CodeRabbit asked for `handlePrint` to be blocked alongside the two save
   * actions. Two reasons it is not, the second being the load-bearing one:
   *
   *  1. It cannot be. Ctrl+P and the browser print menu bypass any button
   *     state, so disabling it is theatre, not protection.
   *  2. The advisory PRINTS. It sits outside every `print:hidden` container, so
   *     the exported PDF carries the "Do not send" panel with it -- the warning
   *     travels to whoever receives the document, which is stronger than a
   *     disabled button that never leaves the operator's screen.
   *
   * Reason 2 is a layout fact that a later refactor could silently break --
   * moving the advisory inside a `print:hidden` wrapper would produce a clean
   * printed quote for an unsafe job. This asserts it instead of trusting it.
   *
   * Sabotage: add `print:hidden` to the advisory container -- this goes red.
   */
  it("keeps the advisory in the printed output, where blocking cannot reach", async () => {
    mockCalculate(CRITICAL);
    render(<QuotePage />);
    await calculate();

    let node: HTMLElement | null = screen.getByText(/Do not send/i);
    const hidden: string[] = [];
    while (node) {
      if (String(node.className ?? "").includes("print:hidden")) {
        hidden.push(node.className);
      }
      node = node.parentElement;
    }

    expect(hidden).toEqual([]);
  });

  // A warning is informational -- power constraints, occupied-home protocols.
  // Blocking on those would train estimators to ignore the critical ones.
  it("does not block on a warning-only advisory", async () => {
    mockCalculate([{ severity: "warning", text: "Supply is tight." }]);
    render(<QuotePage />);
    await calculate();

    expect(screen.getByText(/Check before sending/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save as Estimate/i }),
    ).not.toBeDisabled();
  });
});
