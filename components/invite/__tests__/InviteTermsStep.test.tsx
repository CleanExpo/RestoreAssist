// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InviteTermsStep } from "../InviteTermsStep";

const baseProps = {
  organizationName: "Acme Restoration",
  inviterName: "Pat Manager",
  roleLabel: "Technician",
  submitting: false,
  onSubmit: vi.fn(),
};

describe("InviteTermsStep", () => {
  it("disables the submit button until both checkboxes are ticked", () => {
    render(<InviteTermsStep {...baseProps} />);
    const submit = screen.getByRole("button", {
      name: /join acme restoration/i,
    });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/terms of service/i));
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/chain-of-custody/i));
    expect(submit).toBeEnabled();
  });

  it("respects the `disabled` prop even when both checkboxes are ticked (Google path gate)", () => {
    render(<InviteTermsStep {...baseProps} disabled />);
    fireEvent.click(screen.getByLabelText(/terms of service/i));
    fireEvent.click(screen.getByLabelText(/chain-of-custody/i));
    const submit = screen.getByRole("button", {
      name: /join acme restoration/i,
    });
    expect(submit).toBeDisabled();
  });

  it("invokes onSubmit with the two acceptance flags", () => {
    const onSubmit = vi.fn();
    render(<InviteTermsStep {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText(/terms of service/i));
    fireEvent.click(screen.getByLabelText(/chain-of-custody/i));
    fireEvent.click(
      screen.getByRole("button", { name: /join acme restoration/i }),
    );
    expect(onSubmit).toHaveBeenCalledWith({
      acceptedTerms: true,
      acceptedChainOfCustody: true,
    });
  });
});
