// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn(), success: vi.fn(), error: vi.fn(), push: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }), useSearchParams: () => h.params }));
vi.mock("@/lib/notify", () => ({ notifyError: h.error, notifySuccess: h.success }));
import Page from "../forgot-password/page";

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("fetch", h.fetch); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (status: number, body: unknown = { success: true }) => new Response(JSON.stringify(body), { status });
async function requestCode() {
  fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "synthetic@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Verification Code" }));
}
async function enterCode() {
  await requestCode();
  await screen.findByLabelText("Verification Code");
  fireEvent.change(screen.getByLabelText("Verification Code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("password recovery truthful states", () => {
  it.each([400, 403, 429, 500, 503])("keeps email step after HTTP %s, without success notification", async (status) => {
    h.fetch.mockResolvedValue(response(status, { error: { message: "Internal detail" } }));
    render(<Page />); await requestCode();
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.queryByLabelText("Verification Code")).not.toBeInTheDocument();
    expect(h.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Internal detail")).not.toBeInTheDocument();
  });
  it("does not claim delivery or verified code before server validation; shows real lifetime and Google guidance", async () => {
    h.fetch.mockResolvedValue(response(200)); render(<Page />); await requestCode();
    await screen.findByLabelText("Verification Code");
    expect(screen.getByText(/10 minutes/)).toBeInTheDocument();
    expect(screen.queryByText(/has been sent/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue with Google/ })).toHaveAttribute("href", "/login?switchAccount=google");
    fireEvent.change(screen.getByLabelText("Verification Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByText(/Code verified/)).not.toBeInTheDocument();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("New Password")).toHaveAttribute("minlength", "12");
    expect(screen.getByLabelText("Confirm Password")).toHaveAttribute("minlength", "12");
  });
  it("returns to editable code input after an invalid code and allows resending", async () => {
    h.fetch.mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(400, { error: { message: "Invalid verification code." } }));
    render(<Page />); await enterCode();
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "synthetic-long-password" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "synthetic-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByLabelText("Verification Code")).toHaveValue("");
    expect(screen.getByText("Invalid verification code.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Didn't receive a code/ }));
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
  });
  it("blocks duplicate email submissions while the request is pending", async () => {
    let finish!: (value: Response) => void;
    h.fetch.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    const { container } = render(<Page />);
    fireEvent.submit(container.querySelector("form")!); fireEvent.submit(container.querySelector("form")!);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    finish(response(200)); await screen.findByLabelText("Verification Code");
  });
});
