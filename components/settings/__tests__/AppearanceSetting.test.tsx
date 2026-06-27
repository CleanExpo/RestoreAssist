// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { setThemeMock, useThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  useThemeMock: vi.fn(),
}));
vi.mock("next-themes", () => ({ useTheme: useThemeMock }));

import { AppearanceSetting } from "@/components/settings/AppearanceSetting";

beforeEach(() => {
  setThemeMock.mockReset();
  useThemeMock.mockReset();
  useThemeMock.mockReturnValue({ theme: "dark", setTheme: setThemeMock });
});

describe("AppearanceSetting", () => {
  it("renders Light, Dark, and System options", () => {
    render(<AppearanceSetting />);
    expect(screen.getByRole("radio", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeInTheDocument();
  });

  it("calls setTheme('light') when Light is chosen", () => {
    render(<AppearanceSetting />);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("calls setTheme('dark') when Dark is chosen", () => {
    // Start from a non-dark theme so the Dark radio is unchecked — clicking an
    // already-checked native radio fires no change event (correct behavior).
    useThemeMock.mockReturnValue({ theme: "light", setTheme: setThemeMock });
    render(<AppearanceSetting />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme('system') when System is chosen", () => {
    render(<AppearanceSetting />);
    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(setThemeMock).toHaveBeenCalledWith("system");
  });

  it("marks the current theme as the checked radio", () => {
    render(<AppearanceSetting />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
  });
});
