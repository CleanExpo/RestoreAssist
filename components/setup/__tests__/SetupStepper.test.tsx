// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SetupStepper, type SetupStepperItem } from "../SetupStepper";

function items(overrides: Partial<Record<string, boolean>> = {}): SetupStepperItem[] {
  return [
    { key: "welcome", title: "Welcome", required: false, complete: overrides.welcome ?? true, content: <div>WELCOME BODY</div> },
    { key: "ai_key", title: "AI key", required: true, complete: overrides.ai_key ?? false, content: <div>AI KEY BODY</div> },
    { key: "business", title: "Business", required: true, complete: overrides.business ?? false, content: <div>BUSINESS BODY</div> },
    { key: "first_report", title: "First report", required: false, complete: overrides.first_report ?? false, content: <div>REPORT BODY</div> },
  ];
}

describe("SetupStepper — locked one-step-at-a-time", () => {
  it("shows only the current step's content", () => {
    render(<SetupStepper items={items()} />);
    expect(screen.getByText("WELCOME BODY")).toBeInTheDocument();
    expect(screen.queryByText("AI KEY BODY")).not.toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
  });

  it("disables Back on the first step", () => {
    render(<SetupStepper items={items()} />);
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
  });

  it("locks Next on a required-but-incomplete step and unlocks when complete", () => {
    // Start on the ai_key step (index 1), incomplete → Next disabled.
    const { rerender } = render(
      <SetupStepper items={items()} initialIndex={1} />,
    );
    expect(screen.getByText("AI KEY BODY")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByText(/complete this step to continue/i)).toBeInTheDocument();

    // Mark ai_key complete → Next enabled, hint gone.
    rerender(<SetupStepper items={items({ ai_key: true })} initialIndex={1} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
    expect(
      screen.queryByText(/complete this step to continue/i),
    ).not.toBeInTheDocument();
  });

  it("advances to the next step when Next is clicked", () => {
    render(<SetupStepper items={items({ ai_key: true })} initialIndex={1} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("BUSINESS BODY")).toBeInTheDocument();
    expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument();
  });

  it("gates the final 'Generate your first report' CTA on all required steps", () => {
    const onFinish = vi.fn();
    // Last step, required steps NOT complete → CTA disabled.
    const { rerender } = render(
      <SetupStepper items={items()} initialIndex={3} onFinish={onFinish} />,
    );
    const cta = () =>
      screen.getByRole("button", { name: /generate your first report/i });
    expect(cta()).toBeDisabled();
    fireEvent.click(cta());
    expect(onFinish).not.toHaveBeenCalled();

    // All required complete → CTA enabled + fires onFinish.
    rerender(
      <SetupStepper
        items={items({ ai_key: true, business: true })}
        initialIndex={3}
        onFinish={onFinish}
      />,
    );
    expect(cta()).toBeEnabled();
    fireEvent.click(cta());
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
