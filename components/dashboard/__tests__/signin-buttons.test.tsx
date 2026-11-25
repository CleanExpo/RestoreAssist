// @vitest-environment jsdom
/**
 * Sign-in prompts are real buttons, 401 and 403 read differently, and no
 * customer text carries an HTTP status code. Each state is asserted on the
 * component a customer actually sees.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedApiError } from "@/lib/client/parse-api-error";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/reports/r-1",
}));

import { SignInAgainButton } from "../SignInAgainButton";
import { WorkspaceAccessNotice } from "../WorkspaceAccessNotice";
import { DashboardLoadFailureList } from "../DashboardLoadFailureList";
import { DetailLoadErrorPanel } from "../DetailLoadErrorPanel";
import { DashboardListErrorBanner } from "../DashboardListErrorBanner";
import {
  customerErrorMessage,
  NO_ACCESS_MESSAGE,
  SESSION_ENDED_MESSAGE,
} from "@/lib/client/customer-error-copy";
import { visionErrorMessage } from "@/components/inspection/MeterPhotoCapture";

afterEach(cleanup);

const err = (status: number, message = "Internal server error"): ParsedApiError => ({
  code: "X",
  message,
  status,
});

function expectRealButton(name: string) {
  const el = screen.getByRole("link", { name });
  // Rendered through the shared Button, so it carries the button styling hook.
  expect(el).toHaveAttribute("data-slot", "button");
  expect(el.className).toContain("bg-brand-cta");
  return el;
}

describe("SignInAgainButton", () => {
  it("is a button-styled link that returns the customer to where they were", () => {
    render(<SignInAgainButton callbackUrl="/dashboard/settings" />);
    const el = expectRealButton("Sign in again");
    expect(el).toHaveAttribute("href", "/login?callbackUrl=%2Fdashboard%2Fsettings");
  });
});

describe("WorkspaceAccessNotice", () => {
  it("401: plain wording and a Sign in again button", () => {
    render(<WorkspaceAccessNotice status={401} />);
    expect(screen.getByRole("alert")).toHaveTextContent(SESSION_ENDED_MESSAGE);
    expectRealButton("Sign in again");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/HTTP|\b401\b/);
  });

  it("403: no-access wording, no sign-in prompt", () => {
    render(<WorkspaceAccessNotice status={403} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You do not have access to this workspace",
    );
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/HTTP|\b403\b/);
  });
});

describe("DashboardLoadFailureList", () => {
  const retry = vi.fn();
  it("401: Sign in again button plus an outline Retry button", () => {
    render(
      <DashboardLoadFailureList
        failures={[{ label: "Reports", error: err(401), loading: false, retry }]}
      />,
    );
    expectRealButton("Sign in again");
    const retryBtn = screen.getByRole("button", { name: "Retry reports" });
    expect(retryBtn).toHaveAttribute("data-slot", "button");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/HTTP|\b401\b/);
  });

  it("403: no-access wording, no sign-in prompt and no pointless Retry", () => {
    render(
      <DashboardLoadFailureList
        failures={[{ label: "Invoices", error: err(403), loading: false, retry }]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(NO_ACCESS_MESSAGE);
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("500: generic wording with Retry, never the status code", () => {
    render(
      <DashboardLoadFailureList
        failures={[{ label: "Clients", error: err(500), loading: false, retry }]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong on our side");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/HTTP|\b500\b/);
    expect(screen.getByRole("button", { name: "Retry clients" })).toBeEnabled();
  });
});

describe("DetailLoadErrorPanel", () => {
  const props = {
    resourceLabel: "report",
    backHref: "/dashboard/reports",
    backLabel: "Back to reports",
    onRetry: vi.fn(),
  };

  it("401: session-ended title, Sign in again button returning to this page, Retry as outline", () => {
    render(<DetailLoadErrorPanel {...props} error={err(401)} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Your session has ended");
    const signIn = expectRealButton("Sign in again");
    expect(signIn).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fdashboard%2Freports%2Fr-1",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute(
      "data-slot",
      "button",
    );
  });

  it("403: own wording, not a dead end (a way back), no sign-in and no Retry", () => {
    render(<DetailLoadErrorPanel {...props} error={err(403)} />);
    expect(screen.getByRole("heading")).toHaveTextContent("No access");
    expect(screen.getByText(/do not have access to this report/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to reports" })).toHaveAttribute(
      "href",
      "/dashboard/reports",
    );
  });

  it("500 with a bare fallback message never shows an HTTP code", () => {
    render(
      <DetailLoadErrorPanel
        {...props}
        error={err(500, "Request failed (HTTP 500)")}
      />,
    );
    expect(document.body).not.toHaveTextContent(/HTTP|\b500\b/);
  });
});

describe("DashboardListErrorBanner", () => {
  it("401: Sign in again button and outline Retry", () => {
    render(
      <DashboardListErrorBanner resourceLabel="invoices" error={err(401)} onRetry={vi.fn()} />,
    );
    expectRealButton("Sign in again");
    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute(
      "data-slot",
      "button",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/HTTP|\b401\b/);
  });

  it("403: no-access wording, no sign-in prompt, no Retry", () => {
    render(
      <DashboardListErrorBanner resourceLabel="invoices" error={err(403)} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("You do not have access");
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("customerErrorMessage and the meter photo prompt", () => {
  it("never returns a status code or developer phrase", () => {
    for (const status of [0, 400, 401, 403, 404, 409, 429, 500, 502, 503]) {
      const text = customerErrorMessage({ status, message: "Request failed (HTTP 418)" });
      expect(text, String(status)).not.toMatch(/HTTP|\b[45]\d{2}\b|Request failed/);
    }
  });

  it("meter photo 401 uses the shared session-ended wording", () => {
    expect(visionErrorMessage(401, null)).toBe(SESSION_ENDED_MESSAGE);
    // 403 is not given a sign-in wording: signing in again cannot help.
    expect(visionErrorMessage(403, null)).not.toMatch(/sign in/i);
  });
});
