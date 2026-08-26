// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AvatarOrb } from "../AvatarOrb";
import {
  DRAG_THRESHOLD_PX,
  ORB_POSITION_STORAGE_KEY,
} from "../use-draggable-orb";

vi.mock("next/image", () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string; [k: string]: unknown }) => {
    return <img src={src} alt={alt} {...rest} />;
  },
}));

/**
 * jsdom gives every element a zero-size rect, so a drag computed from
 * getBoundingClientRect would always start at the origin. Pin a plausible
 * bottom-right corner instead.
 */
function stubOrbRect(orb: HTMLElement, left = 318, top = 764) {
  vi.spyOn(orb, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + 64,
    bottom: top + 64,
    width: 64,
    height: 64,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

function getOrb() {
  return screen.getByRole("button", { name: /open margot/i });
}

/** A drag is pointerdown, movement past the threshold, pointerup, then click. */
function drag(orb: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(orb, { button: 0, clientX: 318, clientY: 764 });
  fireEvent.pointerMove(window, { clientX: 318 + dx, clientY: 764 + dy });
  fireEvent.pointerUp(window, { clientX: 318 + dx, clientY: 764 + dy });
  fireEvent.click(orb);
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("AvatarOrb — moving Margot out of the way", () => {
  // The reported defect: on a phone the only way to touch Margot was the way
  // that opened her chat panel, so she could not be moved off the signup form.
  it("does not open the dialog when she is dragged", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();
    stubOrbRect(orb);

    drag(orb, -200, -300);

    expect(
      screen.queryByRole("dialog", { name: /margot assistant/i }),
    ).not.toBeInTheDocument();
  });

  it("still opens the dialog on a plain tap", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();
    stubOrbRect(orb);

    fireEvent.pointerDown(orb, { button: 0, clientX: 318, clientY: 764 });
    fireEvent.pointerUp(window, { clientX: 318, clientY: 764 });
    fireEvent.click(orb);

    expect(
      screen.getByRole("dialog", { name: /margot assistant/i }),
    ).toBeInTheDocument();
  });

  // A finger never holds perfectly still. Movement below the threshold has to
  // stay a tap, or Margot becomes impossible to open on a touch screen.
  it("treats a wobble below the threshold as a tap, not a drag", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();
    stubOrbRect(orb);

    drag(orb, DRAG_THRESHOLD_PX - 1, 0);

    expect(
      screen.getByRole("dialog", { name: /margot assistant/i }),
    ).toBeInTheDocument();
  });

  it("opens again on the tap that follows a drag", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();
    stubOrbRect(orb);

    drag(orb, -200, -300);
    expect(
      screen.queryByRole("dialog", { name: /margot assistant/i }),
    ).not.toBeInTheDocument();

    // Suppression must last exactly one click, otherwise she is stuck shut.
    fireEvent.pointerDown(orb, { button: 0, clientX: 100, clientY: 400 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 400 });
    fireEvent.click(orb);

    expect(
      screen.getByRole("dialog", { name: /margot assistant/i }),
    ).toBeInTheDocument();
  });

  it("moves her and remembers where she was put", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();
    stubOrbRect(orb);

    drag(orb, -200, -300);

    expect(orb.style.left).toBe("118px");
    expect(orb.style.top).toBe("464px");
    expect(
      JSON.parse(window.localStorage.getItem(ORB_POSITION_STORAGE_KEY) ?? "{}"),
    ).toEqual({ x: 118, y: 464 });
  });

  it("restores a saved position on the next visit", () => {
    window.localStorage.setItem(
      ORB_POSITION_STORAGE_KEY,
      JSON.stringify({ x: 24, y: 120 }),
    );
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();

    expect(orb.style.left).toBe("24px");
    expect(orb.style.top).toBe("120px");
  });

  it("clamps a stored position that no longer fits the viewport", () => {
    // Saved on a tablet, reopened on a phone: without clamping she would be
    // off-screen and unreachable.
    window.localStorage.setItem(
      ORB_POSITION_STORAGE_KEY,
      JSON.stringify({ x: 2000, y: 3000 }),
    );
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();

    expect(Number(orb.style.left.replace("px", ""))).toBeLessThanOrEqual(390 - 64);
    expect(Number(orb.style.top.replace("px", ""))).toBeLessThanOrEqual(844 - 64);
  });

  it("moves with the arrow keys so the gesture is not pointer-only", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();
    stubOrbRect(orb, 200, 400);

    fireEvent.keyDown(orb, { key: "ArrowLeft" });

    expect(orb.style.left).toBe("184px");
  });

  it("ignores a right-click so it cannot start a drag", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    const orb = getOrb();
    stubOrbRect(orb);

    fireEvent.pointerDown(orb, { button: 2, clientX: 318, clientY: 764 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });

    expect(orb.style.left).toBe("");
  });

  it("sets touch-action none so a touch drag is not stolen by scrolling", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);
    expect(getOrb().style.touchAction).toBe("none");
  });
});
