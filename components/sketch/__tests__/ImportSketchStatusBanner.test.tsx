// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ImportSketchStatusBanner } from "../ImportSketchStatusBanner";

describe("ImportSketchStatusBanner", () => {
  it("shows backup reader copy and dismisses", () => {
    render(
      <ImportSketchStatusBanner
        roomCount={2}
        vendor="abliteration"
        primaryFailureDetail="timeout"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/backup reader/i);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
