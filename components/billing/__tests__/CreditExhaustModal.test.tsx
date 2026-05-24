// @vitest-environment jsdom
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import CreditExhaustModal from "../CreditExhaustModal";

describe("CreditExhaustModal", () => {
  it("does not render initially", () => {
    render(<CreditExhaustModal />);
    expect(screen.queryByText(/out of credits/i)).not.toBeInTheDocument();
  });

  it("opens when credit-exhausted event fires", () => {
    render(<CreditExhaustModal />);
    act(() => {
      window.dispatchEvent(new CustomEvent("credit-exhausted"));
    });
    expect(screen.getByText(/out of credits/i)).toBeInTheDocument();
  });

  it("CTA link goes to /billing/upgrade?reason=credits", () => {
    render(<CreditExhaustModal />);
    act(() => {
      window.dispatchEvent(new CustomEvent("credit-exhausted"));
    });
    const upgradeLink = screen.getByRole("link", { name: /upgrade plan/i });
    expect(upgradeLink).toHaveAttribute(
      "href",
      "/billing/upgrade?reason=credits",
    );
  });
});
