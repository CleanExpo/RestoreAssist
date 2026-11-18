// @vitest-environment jsdom
import { act, render, cleanup } from "@testing-library/react";
import { useTheme } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { AppThemeProvider } from "@/components/app-theme-provider";

let setThemeRef: ((t: string) => void) | null = null;
function Probe() {
  const { setTheme } = useTheme();
  setThemeRef = setTheme;
  return null;
}

function mount(path: string) {
  usePathnameMock.mockReturnValue(path);
  return render(
    <AppThemeProvider>
      <Probe />
    </AppThemeProvider>,
  );
}

const html = () => document.documentElement.classList;

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  cleanup();
  setThemeRef = null;
});

describe("AppThemeProvider", () => {
  it("defaults the dashboard to dark when nothing is stored", () => {
    mount("/dashboard");
    expect(html().contains("dark")).toBe(true);
  });

  it("applies a stored Light choice on the dashboard", () => {
    localStorage.setItem("theme", "light");
    mount("/dashboard/settings");
    expect(html().contains("dark")).toBe(false);
    expect(html().contains("light")).toBe(true);
  });

  it("switches between Light and Dark when the user chooses", () => {
    mount("/dashboard/settings");
    act(() => setThemeRef?.("light"));
    expect(html().contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
    act(() => setThemeRef?.("dark"));
    expect(html().contains("dark")).toBe(true);
  });

  it("System follows the device setting", () => {
    localStorage.setItem("theme", "system");
    mount("/dashboard");
    // matchMedia(prefers-color-scheme: dark) is false in this test
    expect(html().contains("dark")).toBe(false);
  });

  it("keeps public pages dark even with Light stored", () => {
    localStorage.setItem("theme", "light");
    mount("/");
    expect(html().contains("dark")).toBe(true);
  });
});
