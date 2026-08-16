// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

// Finishing setup is a server round-trip (activate + session refresh), so the
// CTA owns the pending/error state. Without this the operator gets no feedback
// and can fire activation repeatedly.
describe("SetupStepper — async finish", () => {
  const finished = () =>
    render(
      <SetupStepper
        items={items({ ai_key: true, business: true })}
        initialIndex={3}
        onFinish={vi.fn()}
      />,
    );

  function renderWith(onFinish: () => Promise<void>) {
    return render(
      <SetupStepper
        items={items({ ai_key: true, business: true })}
        initialIndex={3}
        onFinish={onFinish}
      />,
    );
  }

  it("disables the CTA while an async finish is in flight", async () => {
    let release!: () => void;
    const onFinish = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    renderWith(onFinish);

    fireEvent.click(
      screen.getByRole("button", { name: /generate your first report/i }),
    );

    const pending = await screen.findByRole("button", {
      name: /setting up your workspace/i,
    });
    expect(pending).toBeDisabled();

    release();
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it("fires activation once even when the CTA is clicked repeatedly", async () => {
    let release!: () => void;
    const onFinish = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    renderWith(onFinish);

    const cta = screen.getByRole("button", {
      name: /generate your first report/i,
    });
    fireEvent.click(cta);
    fireEvent.click(cta);
    fireEvent.click(cta);

    await screen.findByRole("button", { name: /setting up your workspace/i });
    expect(onFinish).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it("blocks a re-entrant click even when the DOM attribute is forced off", async () => {
    // `disabled` is the whole re-entrancy defence, and it is stronger than the
    // attribute: React decides whether to run onClick from the element's
    // committed fiber props, so clearing `element.disabled` by hand does not
    // reopen the handler. This pins that behaviour — if the CTA ever stops
    // being a real `<button disabled>` (a div with role="button", say), this
    // test goes red and the guard has to be reinstated in handleFinish.
    let release!: () => void;
    const onFinish = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    renderWith(onFinish);

    const cta = screen.getByRole("button", {
      name: /generate your first report/i,
    });
    fireEvent.click(cta);
    await screen.findByRole("button", { name: /setting up your workspace/i });
    expect(onFinish).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        (cta as HTMLButtonElement).disabled = false;
        cta.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
    }

    expect((cta as HTMLButtonElement).disabled).toBe(false); // attribute really was cleared
    expect(onFinish).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it("surfaces a rejection in place and re-enables the CTA for a retry", async () => {
    const onFinish = vi
      .fn()
      .mockRejectedValueOnce(new Error("Setup can't finish yet — Storage needs attention."))
      .mockResolvedValueOnce(undefined);
    renderWith(onFinish);

    fireEvent.click(
      screen.getByRole("button", { name: /generate your first report/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Setup can't finish yet — Storage needs attention.",
    );

    // Retryable: the CTA comes back rather than stranding the operator.
    const cta = screen.getByRole("button", {
      name: /generate your first report/i,
    });
    expect(cta).toBeEnabled();

    fireEvent.click(cta);
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  it("falls back to a generic message when the rejection carries none", async () => {
    renderWith(vi.fn().mockRejectedValue(new Error("")));

    fireEvent.click(
      screen.getByRole("button", { name: /generate your first report/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not finish setup/i);
  });

  it("leaves the CTA disabled after a successful finish so activation cannot re-fire", async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    renderWith(onFinish);

    fireEvent.click(
      screen.getByRole("button", { name: /generate your first report/i }),
    );

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    // Success navigates away; the button must not invite a second activation
    // while the browser is still tearing the page down.
    expect(
      screen.getByRole("button", { name: /setting up your workspace/i }),
    ).toBeDisabled();
  });

  it("still renders the CTA when no onFinish is supplied", () => {
    finished();
    expect(
      screen.getByRole("button", { name: /generate your first report/i }),
    ).toBeEnabled();
  });
});
