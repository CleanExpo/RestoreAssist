// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { SearchBar } from "@/components/SearchBar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SearchBar debounce (ref-based timer)", () => {
  it("fires onSearch once after the debounce window", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const { getByRole } = render(<SearchBar onSearch={onSearch} minChars={2} />);
    const input = getByRole("textbox");

    fireEvent.change(input, { target: { value: "wa" } });
    fireEvent.change(input, { target: { value: "wat" } });
    fireEvent.change(input, { target: { value: "wate" } });

    // No fire before the window elapses.
    vi.advanceTimersByTime(299);
    expect(onSearch).not.toHaveBeenCalled();

    // Only the last value fires — earlier keystrokes' timers were cancelled.
    vi.advanceTimersByTime(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("wate");
  });

  it("cancels the pending timer when callback-prop identity changes mid-window (no stale/out-of-order fire)", () => {
    vi.useFakeTimers();

    // Parent re-renders with a fresh onSearch identity on every render — the
    // exact scenario that made the old useCallback(debounce(...)) leak a timer.
    const calls: string[] = [];
    function Harness() {
      const onSearch = (q: string) => {
        calls.push(q);
      };
      return <SearchBar onSearch={onSearch} minChars={2} />;
    }

    const { getByRole, rerender } = render(<Harness />);
    const input = getByRole("textbox");

    // First keystroke arms a 300ms timer under the first onSearch identity.
    fireEvent.change(input, { target: { value: "ab" } });
    vi.advanceTimersByTime(100);

    // Parent re-renders (new onSearch identity), then a second keystroke lands.
    rerender(<Harness />);
    fireEvent.change(input, { target: { value: "abc" } });

    // 100ms after the second keystroke: the first (stale) timer's original
    // 300ms mark passes. It must NOT fire — it was cleared by the ref handle.
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]);

    // Only the latest value fires, once, after its own full window.
    vi.advanceTimersByTime(100);
    expect(calls).toEqual(["abc"]);
  });

  it("calls onClear when the field is emptied", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const onClear = vi.fn();
    const { getByRole } = render(
      <SearchBar onSearch={onSearch} onClear={onClear} minChars={2} />,
    );
    const input = getByRole("textbox");

    // A single sub-minChars char never triggers onSearch, then clearing to
    // empty triggers onClear.
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "" } });
    vi.advanceTimersByTime(300);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSearch).not.toHaveBeenCalled();
  });
});
