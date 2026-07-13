// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClaimTypePicker from "../ClaimTypePicker";

describe("ClaimTypePicker — inspection-start IICRC standard selector (RA-1029 P1 #7)", () => {
  it("renders all 4 IICRC-governed claim types as radio options", () => {
    render(<ClaimTypePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Water Damage \(IICRC S500:2021\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mould Remediation \(IICRC S520:2024\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Trauma \/ Biohazard \(IICRC S540:2023\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fire & Smoke \(IICRC S700:2025\)/)).toBeInTheDocument();
  });

  it("renders 4 options via radio role", () => {
    render(<ClaimTypePicker value={null} onChange={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("calls onChange with the selected claim type when an option is clicked", () => {
    const onChange = vi.fn();
    render(<ClaimTypePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Trauma \/ Biohazard \(IICRC S540:2023\)/));
    expect(onChange).toHaveBeenCalledWith("BIOHAZARD");
  });

  it("marks the value prop as checked", () => {
    render(<ClaimTypePicker value="FIRE" onChange={vi.fn()} />);
    const fire = screen.getByLabelText(/Fire & Smoke \(IICRC S700:2025\)/);
    expect(fire).toHaveAttribute("aria-checked", "true");
  });

  it("renders the required-field affordance", () => {
    render(<ClaimTypePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/Claim type/i)).toBeInTheDocument();
    // The label area carries the required asterisk for parity with other inspection fields.
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("surfaces the validation error when provided", () => {
    render(
      <ClaimTypePicker value={null} onChange={vi.fn()} error="Claim type is required" />,
    );
    expect(screen.getByText(/Claim type is required/)).toBeInTheDocument();
  });

  it("disables all options when disabled is set", () => {
    render(
      <ClaimTypePicker value="WATER" onChange={vi.fn()} disabled />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
  });
});
