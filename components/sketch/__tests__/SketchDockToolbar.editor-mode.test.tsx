// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SketchDockToolbar } from "../SketchDockToolbar";

describe("SketchDockToolbar — Quick vs Advanced", () => {
  it("hides CAD tools in quick mode", () => {
    render(
      <SketchDockToolbar
        toolMode="select"
        onToolChange={vi.fn()}
        editorMode="quick"
        onEditorModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Select/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Measure/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Label/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Wall/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Door/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Moisture/ }),
    ).not.toBeInTheDocument();
  });

  it("shows full tools in advanced mode", () => {
    render(
      <SketchDockToolbar
        toolMode="select"
        onToolChange={vi.fn()}
        editorMode="advanced"
        onEditorModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Wall/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Moisture/ })).toBeInTheDocument();
  });

  it("toggles to advanced via mode control", () => {
    const onMode = vi.fn();
    render(
      <SketchDockToolbar
        toolMode="select"
        onToolChange={vi.fn()}
        editorMode="quick"
        onEditorModeChange={onMode}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Advanced draw" }));
    expect(onMode).toHaveBeenCalledWith("advanced");
  });
});
