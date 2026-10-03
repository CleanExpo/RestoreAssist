// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePullToRefresh, useMobilePullRefreshHandler, type RefreshResult } from "@/components/mobile/MobilePullToRefresh";

const route = vi.hoisted(() => ({ pathname: "/dashboard/field" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

function Page({ refresh }: { refresh: () => Promise<RefreshResult> }) {
  useMobilePullRefreshHandler(refresh);
  return <div data-testid="list">
    <input aria-label="Draft note" defaultValue="unsaved" />
    <div data-testid="modal" data-no-pull-refresh>Client form</div>
    Jobs
  </div>;
}

function pull(target: Element, length: number) {
  fireEvent.touchStart(target, { touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.touchMove(target, { touches: [{ clientX: 20, clientY: 20 + length }] });
  fireEvent.touchEnd(target, { touches: [] });
}

describe("MobilePullToRefresh", () => {
  beforeEach(() => {
    route.pathname = "/dashboard/field";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("refreshes once after release and leaves local input state intact", async () => {
    const refresh = vi.fn(async () => ({ kind: "updated" as const, message: "Jobs updated" }));
    render(<MobilePullToRefresh><Page refresh={refresh} /></MobilePullToRefresh>);
    const list = screen.getByTestId("list");
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "still unsaved" } });
    pull(list, 100);
    expect(refresh).not.toHaveBeenCalled();
    pull(list, 160);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Jobs updated"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("still unsaved");
  });

  it("ignores a gesture on editable controls and reports a fetch error", async () => {
    const refresh = vi.fn(async () => ({ kind: "error" as const, message: "Could not refresh jobs" }));
    render(<MobilePullToRefresh><Page refresh={refresh} /></MobilePullToRefresh>);
    pull(screen.getByRole("textbox"), 160);
    expect(refresh).not.toHaveBeenCalled();
    pull(screen.getByTestId("list"), 160);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not refresh jobs"));
  });

  it("blocks duplicate swipes while a request is in flight", async () => {
    let resolve!: (result: RefreshResult) => void;
    const refresh = vi.fn(() => new Promise<RefreshResult>((done) => { resolve = done; }));
    render(<MobilePullToRefresh><Page refresh={refresh} /></MobilePullToRefresh>);
    const list = screen.getByTestId("list");
    pull(list, 160);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    pull(list, 160);
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve({ kind: "offline", message: "Offline. Showing saved jobs." });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Offline. Showing saved jobs."));
  });

  it("cancels sideways movement and nested scrolling", () => {
    const refresh = vi.fn(async () => ({ kind: "updated" as const }));
    render(<MobilePullToRefresh><Page refresh={refresh} /></MobilePullToRefresh>);
    const list = screen.getByTestId("list");
    fireEvent.touchStart(list, { touches: [{ clientX: 20, clientY: 20 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 170, clientY: 25 }] });
    fireEvent.touchEnd(list, { touches: [] });
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.touchStart(list, { touches: [{ clientX: 20, clientY: 20 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 20, clientY: 180 }] });
    fireEvent.touchCancel(list, { touches: [] });
    fireEvent.touchEnd(list, { touches: [] });
    expect(refresh).not.toHaveBeenCalled();

    list.style.overflowY = "auto";
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 300 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 100 });
    pull(list, 160);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancels a pull when a second finger joins", () => {
    const refresh = vi.fn(async () => ({ kind: "updated" as const }));
    render(<MobilePullToRefresh><Page refresh={refresh} /></MobilePullToRefresh>);
    const list = screen.getByTestId("list");
    fireEvent.touchStart(list, { touches: [{ clientX: 20, clientY: 20 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 20, clientY: 180 }] });
    fireEvent.touchStart(list, { touches: [{ clientX: 20, clientY: 180 }, { clientX: 40, clientY: 180 }] });
    fireEvent.touchEnd(list, { touches: [] });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("supports the Clients list while excluding its intake form", async () => {
    route.pathname = "/dashboard/clients";
    const refresh = vi.fn(async () => ({ kind: "updated" as const, message: "Clients updated" }));
    render(<MobilePullToRefresh><Page refresh={refresh} /></MobilePullToRefresh>);
    pull(screen.getByTestId("modal"), 160);
    expect(refresh).not.toHaveBeenCalled();
    pull(screen.getByTestId("list"), 160);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Clients updated"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
