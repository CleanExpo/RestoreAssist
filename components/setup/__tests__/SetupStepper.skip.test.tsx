// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SetupStepper, type SetupStepperItem } from "../SetupStepper";

// RA-7427: the wizard must be leavable with one tap from ANY step, including
// a required step whose Next is locked.
function items(): SetupStepperItem[] {
  return [
    { key: "welcome", title: "Welcome", required: false, complete: true, content: <div>WELCOME BODY</div> },
    { key: "ai_key", title: "AI key", required: true, complete: false, content: <div>AI KEY BODY</div> },
    { key: "first_report", title: "First report", required: false, complete: false, content: <div>REPORT BODY</div> },
  ];
}

describe("SetupStepper — Skip setup for now (RA-7427)", () => {
  it("offers 'Skip setup for now' on the locked required step and calls onSkip", async () => {
    const onSkip = vi.fn().mockResolvedValue(undefined);
    render(<SetupStepper items={items()} initialIndex={1} onSkip={onSkip} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    const skip = screen.getByRole("button", { name: /skip setup for now/i });
    expect(skip).toBeEnabled();
    fireEvent.click(skip);
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
  });

  it("offers it on the first step too, where Back is disabled", () => {
    render(<SetupStepper items={items()} onSkip={vi.fn()} />);
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /skip setup for now/i })).toBeEnabled();
  });

  it("shows the error in place when skipping fails, and re-enables the control", async () => {
    const onSkip = vi.fn().mockRejectedValue(new Error("Could not skip setup"));
    render(<SetupStepper items={items()} initialIndex={1} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: /skip setup for now/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not skip setup");
    expect(screen.getByRole("button", { name: /skip setup for now/i })).toBeEnabled();
  });

  it("does not render the control when no onSkip is wired", () => {
    render(<SetupStepper items={items()} />);
    expect(screen.queryByRole("button", { name: /skip setup for now/i })).not.toBeInTheDocument();
  });
});
