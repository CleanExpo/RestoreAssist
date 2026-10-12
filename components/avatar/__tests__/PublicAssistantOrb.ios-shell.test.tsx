// @vitest-environment jsdom
/**
 * Apple 3.1.1 — the public Margot assistant's chat offers "Get Started"
 * (/signup), so it must not appear in the iOS shell, including on /login.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";

const shell = vi.hoisted(() => ({ ios: false }));

vi.mock("next/navigation", () => ({ usePathname: () => "/login" }));
vi.mock("@/lib/capacitor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/capacitor")>()),
  isCapacitorIOS: () => shell.ios,
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    return <img {...(props as object)} />;
  },
}));

import { PublicAssistantOrb } from "../PublicAssistantOrb";

describe("PublicAssistantOrb in the iOS shell", () => {
  afterEach(() => {
    cleanup();
    shell.ios = false;
  });

  it("renders nothing on /login inside the iOS shell", () => {
    shell.ios = true;
    const { container } = render(<PublicAssistantOrb />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();
  });

  it("still renders on /login in a browser", () => {
    const { container } = render(<PublicAssistantOrb />);
    expect(container).not.toBeEmptyDOMElement();
  });
});
