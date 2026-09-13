// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import CancelledCheckoutNotice from "../CancelledCheckoutNotice";

afterEach(() => {
  cleanup();
});

describe("CancelledCheckoutNotice", () => {
  it("acknowledges a cancelled checkout with the copy the e2e locator expects", () => {
    render(<CancelledCheckoutNotice />);
    expect(screen.getByText(/no problem/i)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      /continue when you're ready/i,
    );
  });
});
