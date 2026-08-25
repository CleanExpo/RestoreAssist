/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Terminal } from "../terminal";

describe("Terminal ANSI rendering", () => {
  it("renders ANSI-coloured output without exposing escape sequences", () => {
    const { container } = render(
      <Terminal output={"\u001b[31mFAILED\u001b[0m plain"} />,
    );

    expect(screen.getByText(/FAILED/)).toBeTruthy();
    expect(container.textContent).toContain("FAILED plain");
    expect(container.textContent).not.toContain("\u001b[");
  });

  it("does not turn terminal URLs into active links", () => {
    const { container } = render(
      <Terminal output="https://untrusted.example/path" />,
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("https://untrusted.example/path");
  });
});
