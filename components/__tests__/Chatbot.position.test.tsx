// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Phill, 25/11/2026: the floating Margot button sat in the bottom-right corner
// and covered the bottom bar's buttons. It now starts clear of the bar and can
// be dragged away; a drag must not also open the chat.

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u_1", name: "Jamie" } },
    status: "authenticated",
  }),
}));
vi.mock("next/image", () => {
  const React = require("react");
  return {
    default: ({ src, alt, ...rest }: Record<string, unknown>) =>
      React.createElement("img", { src, alt, ...rest }),
  };
});
vi.mock("react-markdown", () => {
  const React = require("react");
  return {
    default: ({ children }: { children: string }) =>
      React.createElement("div", null, children),
  };
});
vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

import Chatbot from "../Chatbot";
import { FAB_STORAGE_KEY } from "../chatbot-position";

global.fetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ messages: [] }),
})) as unknown as typeof fetch;
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  // jsdom reports an all-zero rect; give the button a real place to be dragged from.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        left: 310,
        right: 374,
        top: 640,
        bottom: 704,
        width: 64,
        height: 64,
        x: 310,
        y: 640,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

function drag(el: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 340, clientY: 670, button: 0 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 340 + dx, clientY: 670 + dy });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 340 + dx, clientY: 670 + dy });
}

describe("Chatbot button position", () => {
  it("is not pinned to the bottom-right corner by default", async () => {
    render(<Chatbot />);
    const button = await screen.findByLabelText(/Open Margot/i);
    // Lifted above a 64px bar plus the device safe area; never the old bottom-6.
    expect(button.className).toContain("bottom-[calc(5.5rem+env(safe-area-inset-bottom");
    expect(button.className).not.toMatch(/(^|\s)bottom-6(\s|$)/);
    expect(button.className).not.toMatch(/(^|\s)right-6(\s|$)/);
  });

  it("still opens and closes the chat on a plain tap", async () => {
    render(<Chatbot />);
    const button = await screen.findByLabelText(/Open Margot/i);
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 340, clientY: 670, button: 0 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 341, clientY: 671 });
    fireEvent.click(button);
    expect(await screen.findByPlaceholderText(/Type or speak/i)).toBeInTheDocument();
  });

  it("moves where it is dragged, keeps the spot, and does not open the chat", async () => {
    render(<Chatbot />);
    const button = await screen.findByLabelText(/Open Margot/i);
    drag(button, -120, -200);
    // Starts 16px from the right and 96px from the bottom; dragged 120 left and
    // 200 up, so it is 120 further from the right and 200 further from the bottom.
    expect(button.style.right).toBe("136px");
    expect(button.style.bottom).toBe("296px");
    expect(JSON.parse(window.localStorage.getItem(FAB_STORAGE_KEY) as string)).toEqual({
      right: 136,
      bottom: 296,
    });
    fireEvent.click(button); // the click that ends a drag
    expect(screen.queryByPlaceholderText(/Type or speak/i)).not.toBeInTheDocument();
    fireEvent.click(button); // the next real tap opens it
    expect(await screen.findByPlaceholderText(/Type or speak/i)).toBeInTheDocument();
  });

  it("cannot be dragged off the screen", async () => {
    render(<Chatbot />);
    const button = await screen.findByLabelText(/Open Margot/i);
    drag(button, 5000, 5000);
    expect(button.style.right).toBe("8px");
    expect(button.style.bottom).toBe("8px");
  });

  it("restores a saved position, and keeps the chat window just above the button", async () => {
    window.localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify({ right: 30, bottom: 300 }));
    render(<Chatbot />);
    const button = await screen.findByLabelText(/Open Margot/i);
    expect(button.style.right).toBe("30px");
    expect(button.style.bottom).toBe("300px");
    fireEvent.click(button);
    await screen.findByPlaceholderText(/Type or speak/i);
    const win = document.querySelector("[data-margot-window]") as HTMLElement;
    expect(win.style.right).toBe("30px");
    expect(win.style.bottom).toBe("372px"); // 300 + 64 button + 8 gap
  });

  it("ignores a corrupt saved position", async () => {
    window.localStorage.setItem(FAB_STORAGE_KEY, "not json");
    render(<Chatbot />);
    const button = await screen.findByLabelText(/Open Margot/i);
    expect(button.style.right).toBe("");
    expect(button.className).toContain("bottom-[calc(5.5rem");
  });
});
