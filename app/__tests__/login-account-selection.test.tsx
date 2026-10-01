// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ oauth: vi.fn(), signIn: vi.fn(), getSession: vi.fn(), success: vi.fn(), error: vi.fn(), params: new URLSearchParams(), session: null as any }));
vi.mock("@/components/landing/home", () => ({ MarketingShell: ({ children }: any) => children }));
vi.mock("next/navigation", () => ({ useSearchParams: () => h.params }));
vi.mock("next-auth/react", () => ({ signIn: h.signIn, getSession: h.getSession, useSession: () => ({ data: h.session }) }));
vi.mock("@/lib/oauth-native", () => ({ signInWithOAuth: h.oauth }));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));
vi.mock("@/lib/notify", () => ({ notifyError: h.error, notifySuccess: h.success }));
import LoginPage from "../login/page";
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); h.params = new URLSearchParams(); h.session = null; h.oauth.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("account selection at login", () => {
  it("shows the currently signed-in identity and a clear switch action", async () => {
    h.session = { user: { id: "demo-user", email: "demo@example.com" } };
    h.params = new URLSearchParams("callbackUrl=/dashboard/inspections/prior-job");
    render(<LoginPage />);
    expect(screen.getByText("demo@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use another Google account" }));
    await waitFor(() => expect(h.oauth).toHaveBeenCalledWith("google", { callbackUrl: "/dashboard" }));
  });
  it("starts an explicit switch at dashboard instead of a previous account's job", async () => {
    h.params = new URLSearchParams("switchAccount=google&callbackUrl=/dashboard/inspections/prior-job");
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Use another Google account" }));
    await waitFor(() => expect(h.oauth).toHaveBeenCalledWith("google", { callbackUrl: "/dashboard" }));
  });
  it("preserves a safe callback for ordinary login", async () => {
    h.params = new URLSearchParams("callbackUrl=/dashboard/reports?tab=draft");
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(h.oauth).toHaveBeenCalledWith("google", { callbackUrl: "/dashboard/reports?tab=draft" }));
  });
  it.each(["AccessDenied", "OAuthCallback", "OAuthAccountNotLinked"])("shows recoverable guidance for %s returns without retrying automatically", (error) => {
    h.params = new URLSearchParams({ error }); render(<LoginPage />);
    expect(screen.getByText(/Sign-in was cancelled or could not be completed/)).toBeInTheDocument();
    expect(h.oauth).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });
  it("reenables login after interrupted OAuth and after browser back restoration", async () => {
    h.oauth.mockRejectedValueOnce(new Error("cancelled")); render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    fireEvent(window, new Event("pageshow"));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(h.oauth).toHaveBeenCalledTimes(2));
  });
  it("does not report credential success with a missing or wrong-account session", async () => {
    h.signIn.mockResolvedValue({ ok: true }); h.getSession.mockResolvedValue({ user: { id: "wrong", email: "wrong@example.com" } });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "chosen@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(h.success).not.toHaveBeenCalled();
  });
});
