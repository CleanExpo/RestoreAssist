// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SketchCreateCoach } from "../SketchCreateCoach";

describe("SketchCreateCoach", () => {
  it("tells the technician how to place the first room", () => {
    render(<SketchCreateCoach visible />);
    expect(screen.getByRole("status", { name: /draw first room/i })).toBeInTheDocument();
    expect(screen.getByText(/3\.86 × 3\.86 m/i)).toBeInTheDocument();
  });

  it("lets the technician pick L and T templates before the first tap", () => {
    const onTemplateKindChange = vi.fn();
    render(
      <SketchCreateCoach
        visible
        templateKind="rect"
        onTemplateKindChange={onTemplateKindChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /l-shape/i }));
    expect(onTemplateKindChange).toHaveBeenCalledWith("L");
  });
});
