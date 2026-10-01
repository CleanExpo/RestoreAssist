// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundaryHandler } from "next/dist/client/components/error-boundary";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import RootError from "../error";
import DashboardError from "../dashboard/error";
import LoginError from "../login/error";
import SignupError from "../signup/error";
import GlobalError from "../global-error";

vi.mock("@/lib/observability", () => ({ reportClientError: vi.fn() }));

type ErrorProps = { error: Error; reset: () => void; retry: () => void };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function renderFailedRoute(Fallback: ComponentType<ErrorProps>) {
  let failedResponse = true;
  const refresh = vi.fn(() => { failedResponse = false; });
  function RouteResponse() {
    if (failedResponse) throw new Error("Synthetic route response could not load its chunk");
    return <p>Fresh route response</p>;
  }
  render(
    <AppRouterContext.Provider value={{ refresh } as unknown as AppRouterInstance}>
      <ErrorBoundaryHandler pathname="/login" errorComponent={Fallback}>
        <RouteResponse />
      </ErrorBoundaryHandler>
    </AppRouterContext.Provider>,
  );
  return refresh;
}

describe("route error recovery uses Next's refetch contract", () => {
  it("reset-only control replays the failed response without requesting a fresh route", () => {
    const refresh = renderFailedRoute(({ reset }) => <button onClick={reset}>Try again</button>);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("Fresh route response")).not.toBeInTheDocument();
  });

  it.each([
    ["root", RootError], ["dashboard", DashboardError],
    ["login", LoginError], ["signup", SignupError],
  ] as const)("%s retry refetches and replaces the failed response", (_name, Fallback) => {
    const refresh = renderFailedRoute(Fallback);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Fresh route response")).toBeInTheDocument();
  });

  it("global error recovery invokes retry instead of reset without an automatic reload", () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const Fallback = GlobalError as ComponentType<ErrorProps>;
    render(<Fallback error={new Error("Synthetic layout failure")} reset={reset} retry={retry} />);
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });
});
